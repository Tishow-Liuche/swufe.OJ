import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
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
  heartbeat() { return { status: 'ok' }; }

  @Delete('devices/:id')
  revokeDevice() { return { status: 'ok' }; }
}

/** 扩展 HTTP 轮询接口 */
@Controller('api/helper')
export class HelperTaskController {
  constructor(private helper: HelperService) {}

  @Post('devices/register')
  async registerDeviceExt(@Body() dto: { userId: string; deviceName: string; browserName: string; extensionVersion: string }) {
    if (!dto.userId) return { error: 'userId required' };
    return this.helper.registerDevice(dto.userId, dto);
  }

  @Get('tasks/next')
  async getNextTask(@Query('userId') userId: string, @Query('deviceId') deviceId: string) {
    if (!userId || !deviceId) return { taskId: null };
    const task = await this.helper.getNextTask(userId, deviceId);
    return task || { taskId: null };
  }

  @Post('tasks/:taskId/failure')
  async reportFailure(@Param('taskId') taskId: string, @Body() data: { failureCode: string; failureMessage?: string }) {
    return { status: 'ok' };
  }
}
