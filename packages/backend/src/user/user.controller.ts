import { Controller, Get, Post, Patch, Body, Param, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { UserService } from './user.service';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

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

  // === 管理员接口 ===

  @Get('admin/list')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN')
  listUsers() {
    return this.userService.listUsers();
  }

  @Patch('admin/:id/role')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN')
  setRole(@Param('id') id: string, @Body('role') role: string) {
    return this.userService.setRole(id, role);
  }

  @Post('password')
  @UseGuards(AuthGuard('jwt'))
  changeOwnPassword(@Req() req: any, @Body('password') password: string) {
    return this.userService.changeOwnPassword(req.user.id, password);
  }

  @Patch('admin/:id/teacher-application')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN')
  reviewTeacherApplication(@Param('id') id: string, @Body('status') status: string) {
    return this.userService.reviewTeacherApplication(id, status);
  }

  @Post('admin/:id/reset-password')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN')
  resetPassword(@Param('id') id: string, @Body('password') password: string) {
    return this.userService.resetPassword(id, password);
  }

  @Get('admin/classes')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN')
  listClassApplications() {
    return this.userService.listClassApplications();
  }

  @Patch('admin/classes/:id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN')
  reviewClassApplication(@Param('id') id: string, @Body() data: { status: string; reviewNote?: string }) {
    return this.userService.reviewClassApplication(id, data.status, data.reviewNote);
  }
}
