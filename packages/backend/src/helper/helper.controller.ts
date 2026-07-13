import { Controller, Get, Post, Delete, Body, Param, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { HelperService } from './helper.service';

@Controller('api/external')
export class HelperController {
  constructor(private helper: HelperService) {}

  @Get('platforms')
  getPlatforms() { return this.helper.getPlatforms(); }

  @Post('platforms/seed')
  @UseGuards(AuthGuard('jwt'))
  seedPlatforms() { return this.helper.seedPlatforms(); }

  @Get('accounts')
  @UseGuards(AuthGuard('jwt'))
  getAccounts(@Req() req: any) { return this.helper.getAccounts(req.user.id); }

  @Post('accounts')
  @UseGuards(AuthGuard('jwt'))
  bindAccount(@Req() req: any, @Body() dto: { platform: string; remoteUsername: string }) {
    return this.helper.bindAccount(req.user.id, dto);
  }

  @Delete('accounts/:id')
  @UseGuards(AuthGuard('jwt'))
  unbindAccount(@Param('id') id: string, @Req() req: any) {
    return this.helper.unbindAccount(id, req.user.id);
  }

  @Post('accounts/:id/helper-verify')
  @UseGuards(AuthGuard('jwt'))
  helperVerify(@Param('id') id: string, @Req() req: any, @Body('remoteUsername') username: string) {
    return this.helper.helperVerify(id, req.user.id, username);
  }

  @Get('devices')
  @UseGuards(AuthGuard('jwt'))
  getDevices(@Req() req: any) { return this.helper.getDevices(req.user.id); }

  @Post('devices/register')
  @UseGuards(AuthGuard('jwt'))
  registerDevice(@Req() req: any, @Body() dto: { deviceName: string; browserName: string; extensionVersion: string }) {
    return this.helper.registerDevice(req.user.id, dto);
  }

  @Post('devices/:id/heartbeat')
  @UseGuards(AuthGuard('jwt'))
  heartbeat(@Param('id') id: string, @Req() req: any) {
    return this.helper.heartbeat(id, req.user.id);
  }

  @Delete('devices/:id')
  @UseGuards(AuthGuard('jwt'))
  revokeDevice(@Param('id') id: string, @Req() req: any) {
    return this.helper.revokeDevice(id, req.user.id);
  }
}
