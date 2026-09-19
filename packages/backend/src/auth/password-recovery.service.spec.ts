import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { PasswordRecoveryService } from './password-recovery.service';

describe('PasswordRecoveryService', () => {
  function setup(enabled = true) {
    const values: Record<string, string> = enabled ? {
      SMS_TENCENT_SECRET_ID: 'test', SMS_TENCENT_SECRET_KEY: 'test', SMS_TENCENT_APP_ID: 'test',
      SMS_TENCENT_SIGN_NAME: 'test', SMS_TENCENT_TEMPLATE_ID: 'test', JWT_REFRESH_SECRET: 'test-secret',
    } : {};
    const config = new ConfigService(values);
    const redis = { eval: jest.fn().mockResolvedValue(1), hset: jest.fn(), expire: jest.fn(), del: jest.fn() };
    const tx = { user: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) }, userSession: { deleteMany: jest.fn() } };
    const prisma: any = { user: { findMany: jest.fn().mockResolvedValue([{ id: 'u1', authVersion: 2 }]) },
      $transaction: jest.fn((fn: any) => fn(tx)) };
    const service = new PasswordRecoveryService(config, prisma);
    (service as any).redis = redis;
    const send = jest.spyOn(service as any, 'sendTencent').mockResolvedValue(undefined);
    return { service, prisma, redis, tx, send };
  }
  it('fails closed without a configured provider', async () => {
    const { service, prisma, send } = setup(false);
    expect(service.availability()).toEqual({ enabled: false });
    await expect(service.send('13800138000')).rejects.toThrow('短信服务尚未开通');
    expect(send).not.toHaveBeenCalled();
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });
  it('only looks up active accounts and stores a hash with expiry', async () => {
    const { service, prisma, redis, send } = setup();
    await service.send('13800138000');
    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { phone: '13800138000', deletedAt: null } }));
    expect(redis.hset).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ hash: expect.stringMatching(/^[a-f0-9]{64}$/), userId: 'u1' }));
    expect(redis.expire).toHaveBeenCalledWith(expect.any(String), 300);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('does not send for duplicate or unknown numbers', async () => {
    const { service, prisma, send } = setup();
    for (const users of [[], [{ id: 'u1' }, { id: 'u2' }]]) {
      prisma.user.findMany.mockResolvedValue(users);
      await service.send('13800138000');
    }
    expect(send).not.toHaveBeenCalled();
  });
  it('enforces cooldown before querying users', async () => {
    const { service, redis, prisma } = setup(); redis.eval.mockResolvedValue(0);
    await expect(service.send('13800138000')).rejects.toThrow('频繁');
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });
  it('removes a code when the provider rejects delivery', async () => {
    const { service, redis, send } = setup(); send.mockRejectedValue(new Error('provider'));
    await expect(service.send('13800138000')).rejects.toThrow('短信发送失败');
    expect(redis.del).toHaveBeenCalled();
  });
  it('rejects expired, incorrect or consumed codes without updating credentials', async () => {
    const { service, redis, prisma } = setup(); redis.eval.mockResolvedValue([]);
    await expect(service.reset('13800138000', '123456', 'Password123')).rejects.toThrow('验证码错误或已过期');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('hashes password, guards account version and revokes sessions atomically', async () => {
    const { service, redis, tx } = setup(); redis.eval.mockResolvedValue(['u1', '2']);
    await service.reset('13800138000', '123456', 'Password123');
    const change = tx.user.updateMany.mock.calls[0][0];
    expect(change.where).toEqual({ id: 'u1', phone: '13800138000', authVersion: 2, deletedAt: null });
    expect(await bcrypt.compare('Password123', change.data.password)).toBe(true);
    expect(change.data.authVersion).toEqual({ increment: 1 });
    expect(tx.userSession.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
  });
  it('does not revoke sessions if the phone or account version changed', async () => {
    const { service, redis, tx } = setup(); redis.eval.mockResolvedValue(['u1', '2']);
    tx.user.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.reset('13800138000', '123456', 'Password123')).rejects.toThrow('账号信息已变更');
    expect(tx.userSession.deleteMany).not.toHaveBeenCalled();
  });
});
