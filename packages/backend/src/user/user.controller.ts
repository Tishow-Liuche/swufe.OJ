import { Controller, Get, Patch, Body, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { UserService } from './user.service';

@Controller('api/user')
export class UserController {
  constructor(private userService: UserService) {}

  @Get('profile')
  @UseGuards(AuthGuard('jwt'))
  getProfile(@Req() req: any) {
    return this.userService.getProfile(req.user.id);
  }

  @Patch('profile')
  @UseGuards(AuthGuard('jwt'))
  updateProfile(@Req() req: any, @Body() data: { nickname?: string; avatar?: string }) {
    return this.userService.updateProfile(req.user.id, data);
  }

  @Get('stats')
  @UseGuards(AuthGuard('jwt'))
  getStats(@Req() req: any) {
    return this.userService.getStats(req.user.id);
  }
}
