import { Controller, Get, Post, Patch, Put, Delete, Body, Param, UseGuards, Req } from '@nestjs/common';
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
  updateProfile(
    @Req() req: any,
    @Body() data: { nickname?: string | null; avatar?: string | null; email?: string; phone?: string | null },
  ) {
    return this.userService.updateProfile(req.user.id, data);
  }

  @Get('settings')
  @UseGuards(AuthGuard('jwt'))
  getSettings(@Req() req: any) {
    return this.userService.getSettings(req.user.id);
  }

  @Put('external-accounts')
  @UseGuards(AuthGuard('jwt'))
  updateExternalAccounts(
    @Req() req: any,
    @Body() data: { codeforcesHandle?: string | null; luoguHandle?: string | null },
  ) {
    return this.userService.updateExternalAccounts(req.user.id, data);
  }

  @Get('awards')
  @UseGuards(AuthGuard('jwt'))
  listAwards(@Req() req: any) {
    return this.userService.listAwards(req.user.id);
  }

  @Post('awards')
  @UseGuards(AuthGuard('jwt'))
  createAward(@Req() req: any, @Body() data: any) {
    return this.userService.createAward(req.user.id, data);
  }

  @Patch('awards/:id')
  @UseGuards(AuthGuard('jwt'))
  updateAward(@Req() req: any, @Param('id') id: string, @Body() data: any) {
    return this.userService.updateAward(req.user.id, id, data);
  }

  @Delete('awards/:id')
  @UseGuards(AuthGuard('jwt'))
  deleteAward(@Req() req: any, @Param('id') id: string) {
    return this.userService.deleteAward(req.user.id, id);
  }

  @Get('classes')
  @UseGuards(AuthGuard('jwt'))
  listMyClasses(@Req() req: any) {
    return this.userService.listMyClasses(req.user.id);
  }

  @Post('classes/join')
  @UseGuards(AuthGuard('jwt'))
  applyToClass(@Req() req: any, @Body('joinCode') joinCode: string) {
    return this.userService.applyToClass(req.user.id, joinCode);
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
  resetPassword(@Param('id') id: string, @Req() req: any, @Body('password') password: string) {
    return this.userService.resetPassword(req.user.id, id, password);
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
