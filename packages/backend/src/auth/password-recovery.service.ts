import { BadRequestException, Injectable, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, randomInt } from 'crypto';
import Redis from 'ioredis';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PasswordRecoveryService implements OnModuleDestroy {
  private redis?: Redis;
  constructor(private readonly config: ConfigService, private readonly prisma: PrismaService) {}

  availability() {
    return { enabled: ['SMS_TENCENT_SECRET_ID', 'SMS_TENCENT_SECRET_KEY', 'SMS_TENCENT_APP_ID',
      'SMS_TENCENT_SIGN_NAME', 'SMS_TENCENT_TEMPLATE_ID'].every(key => !!this.config.get<string>(key)) };
  }

  private client() {
    if (!this.redis) this.redis = new Redis({
      host: this.config.getOrThrow('REDIS_HOST'), port: Number(this.config.get('REDIS_PORT', 6379)),
      password: this.config.get('REDIS_PASSWORD'), maxRetriesPerRequest: 1,
      connectTimeout: 5000, commandTimeout: 8000,
    });
    return this.redis;
  }

  onModuleDestroy() { this.redis?.disconnect(); }

  private phone(value: unknown) {
    if (typeof value !== 'string' || !/^1[3-9]\d{9}$/.test(value.trim())) {
      throw new BadRequestException('请输入有效的中国大陆手机号码');
    }
    return value.trim();
  }
  private key(phone: string) {
    return 'password-reset:' + createHash('sha256').update(phone).digest('hex');
  }
  private digest(phone: string, code: string) {
    return createHmac('sha256', this.config.getOrThrow<string>('JWT_REFRESH_SECRET'))
      .update(phone + ':' + code).digest('hex');
  }

  async send(value: unknown) {
    const phone = this.phone(value);
    if (!this.availability().enabled) throw new ServiceUnavailableException('短信服务尚未开通，请联系管理员协助找回密码');
    const key = this.key(phone);
    const redis = this.client();
    // Check both limits atomically. No partial counters or indefinite lockouts.
    const allowed = Number(await redis.eval(
      "if redis.call('EXISTS',KEYS[1])==1 then return 0 end " +
      "if tonumber(redis.call('GET',KEYS[2]) or '0')>=5 then return 0 end " +
      "redis.call('SET',KEYS[1],'1','EX',60) " +
      "local n=redis.call('INCR',KEYS[2]); if n==1 then redis.call('EXPIRE',KEYS[2],86400) end return 1",
      2, key + ':cooldown', key + ':daily'));
    if (!allowed) throw new BadRequestException('发送过于频繁，请稍后再试');
    const users = await this.prisma.user.findMany({ where: { phone, deletedAt: null }, select: { id: true, authVersion: true }, take: 2 });
    const response = { message: '若该手机号唯一绑定了账号，将收到验证码；验证码五分钟内有效', retryAfter: 60 };
    // Avoid account enumeration and ambiguous resets of historical duplicate phone numbers.
    if (users.length !== 1) return response;
    const code = String(randomInt(100000, 1000000));
    const hash = this.digest(phone, code);
    await redis.hset(key, { hash, userId: users[0].id, authVersion: String(users[0].authVersion), attempts: '0' });
    await redis.expire(key, 300);
    try {
      await this.sendTencent(phone, code);
    } catch {
      await redis.del(key);
      throw new ServiceUnavailableException('短信发送失败，请稍后重试或联系管理员');
    }
    return response;
  }

  async reset(value: unknown, code: unknown, password: unknown) {
    const phone = this.phone(value);
    if (typeof code !== 'string' || !/^\d{6}$/.test(code)) throw new BadRequestException('请输入六位验证码');
    if (typeof password !== 'string' || password.length < 8 || Buffer.byteLength(password) > 72 ||
      !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      throw new BadRequestException('密码须至少八位，包含字母和数字，且不能超过72字节');
    }
    if (!this.availability().enabled) throw new ServiceUnavailableException('短信服务尚未开通');
    const key = this.key(phone);
    const result = await this.client().eval(
      "local h=redis.call('HGET',KEYS[1],'hash'); if not h then return {} end " +
      "local a=redis.call('HINCRBY',KEYS[1],'attempts',1); " +
      "if h~=ARGV[1] then if a>=5 then redis.call('DEL',KEYS[1]) end return {} end " +
      "local u=redis.call('HGET',KEYS[1],'userId'); local v=redis.call('HGET',KEYS[1],'authVersion'); " +
      "redis.call('DEL',KEYS[1]); return {u,v}", 1, key, this.digest(phone, code)) as string[];
    if (!result?.length) throw new BadRequestException('验证码错误或已过期，请重新获取');
    const [userId, version] = result;
    const hashed = await bcrypt.hash(password, 12);
    await this.prisma.$transaction(async tx => {
      const changed = await tx.user.updateMany({
        where: { id: userId, phone, authVersion: Number(version), deletedAt: null },
        data: { password: hashed, mustChangePassword: false, authVersion: { increment: 1 } },
      });
      if (changed.count !== 1) throw new BadRequestException('账号信息已变更，请重新获取验证码');
      await tx.userSession.deleteMany({ where: { userId } });
    });
    return { message: '密码已重置，请使用新密码登录' };
  }

  private async sendTencent(phone: string, code: string) {
    const host = 'sms.tencentcloudapi.com';
    const timestamp = Math.floor(Date.now() / 1000);
    const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
    const payload = JSON.stringify({
      PhoneNumberSet: ['+86' + phone],
      SmsSdkAppId: this.config.getOrThrow('SMS_TENCENT_APP_ID'),
      SignName: this.config.getOrThrow('SMS_TENCENT_SIGN_NAME'),
      TemplateId: this.config.getOrThrow('SMS_TENCENT_TEMPLATE_ID'),
      TemplateParamSet: [code],
    });
    const sha = (text: string) => createHash('sha256').update(text).digest('hex');
    const hmac = (key: string | Buffer, text: string) => createHmac('sha256', key).update(text).digest();
    const headers = 'content-type:application/json; charset=utf-8\nhost:' + host + '\n';
    const canonical = 'POST\n/\n\n' + headers + '\ncontent-type;host\n' + sha(payload);
    const scope = date + '/sms/tc3_request';
    const signText = 'TC3-HMAC-SHA256\n' + timestamp + '\n' + scope + '\n' + sha(canonical);
    const secret = hmac(hmac(hmac('TC3' + this.config.getOrThrow<string>('SMS_TENCENT_SECRET_KEY'), date), 'sms'), 'tc3_request');
    const signature = createHmac('sha256', secret).update(signText).digest('hex');
    const authorization = 'TC3-HMAC-SHA256 Credential=' + this.config.getOrThrow('SMS_TENCENT_SECRET_ID') +
      '/' + scope + ', SignedHeaders=content-type;host, Signature=' + signature;
    const response = await fetch('https://' + host, {
      method: 'POST', signal: AbortSignal.timeout(10000),
      headers: { Authorization: authorization, 'Content-Type': 'application/json; charset=utf-8',
        'X-TC-Action': 'SendSms', 'X-TC-Version': '2021-01-11', 'X-TC-Timestamp': String(timestamp),
        'X-TC-Region': this.config.get('SMS_TENCENT_REGION', 'ap-guangzhou') },
      body: payload,
    });
    const body = await response.json() as any;
    if (!response.ok || body.Response?.SendStatusSet?.[0]?.Code !== 'Ok') throw new Error('SMS provider rejected request');
  }
}
