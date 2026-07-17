import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Req,
  Res,
  HttpCode,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto } from './dto';
import { REFRESH_COOKIE, refreshTokenMaxAge } from './refresh-token';

@Controller('api/auth')
export class AuthController {
  constructor(
    private auth: AuthService,
    private config: ConfigService,
  ) {}

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    return this.withRefreshCookie(res, await this.auth.register(dto));
  }

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    return this.withRefreshCookie(res, await this.auth.login(dto));
  }

  @Post('refresh')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies?.[REFRESH_COOKIE];
    if (!refreshToken) {
      throw new UnauthorizedException('登录状态已失效，请重新登录');
    }
    const result = await this.auth.refresh(refreshToken);
    return this.withRefreshCookie(res, result);
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies?.[REFRESH_COOKIE];
    if (refreshToken) await this.auth.logout(refreshToken);
    res.clearCookie(REFRESH_COOKIE, this.refreshCookieOptions());
    return { message: '已退出登录' };
  }

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  getProfile(@Req() req: any) {
    return req.user;
  }

  private withRefreshCookie(res: Response, result: Record<string, any>) {
    const { refreshToken, expiresIn, ...body } = result;
    res.cookie(REFRESH_COOKIE, refreshToken, this.refreshCookieOptions(expiresIn));
    return { ...body, expiresIn };
  }

  private refreshCookieOptions(expiresIn?: string) {
    const secure = this.config.get('NODE_ENV') === 'production'
      || String(this.config.get('COOKIE_SECURE', 'false')) === 'true';
    const options = {
      httpOnly: true,
      secure,
      sameSite: 'lax' as const,
      path: '/api/auth',
    };
    return expiresIn ? { ...options, maxAge: refreshTokenMaxAge(expiresIn) } : options;
  }
}
