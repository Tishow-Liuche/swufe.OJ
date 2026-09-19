import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import { TeacherService } from './teacher.service';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

@Controller('api/teacher')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('TEACHER', 'ADMIN')
export class TeacherController {
  constructor(private teacherService: TeacherService) {}

  // === 班级 ===
  @Get('classes')
  getClasses(@Req() req: any) { return this.teacherService.getClasses(req.user.id); }

  @Post('classes')
  createClass(@Req() req: any, @Body() data: { name: string }) {
    return this.teacherService.createClass(req.user.id, data);
  }

  @Post('classes/:id/import')
  importStudents(@Param('id') id: string, @Req() req: any, @Body() data: { students: string[] | Array<{ studentId: string; name: string; phone: string; email: string }> }) {
    return this.teacherService.importStudents(id, req.user.id, data.students);
  }

  @Get('classes/:id/members')
  getMembers(@Param('id') id: string, @Req() req: any) {
    return this.teacherService.getClassMembers(id, req.user.id);
  }

  @Put('classes/:id/join-code')
  setJoinCode(@Param('id') id: string, @Req() req: any, @Body() data: { expiresAt: string }) {
    return this.teacherService.setJoinCode(id, req.user.id, data.expiresAt);
  }

  @Delete('classes/:id/join-code')
  disableJoinCode(@Param('id') id: string, @Req() req: any) {
    return this.teacherService.disableJoinCode(id, req.user.id);
  }

  @Patch('classes/:id/members/:userId/review')
  reviewMember(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Req() req: any,
    @Body() data: { status: string; reviewNote?: string },
  ) {
    return this.teacherService.reviewMember(id, req.user.id, userId, data.status, data.reviewNote);
  }

  @Delete('classes/:id/members/:userId')
  removeStudent(@Param('id') id: string, @Param('userId') userId: string, @Req() req: any) {
    return this.teacherService.removeStudent(id, req.user.id, userId);
  }

  // === 作业 ===
  @Get('assignments')
  getAssignments(@Req() req: any) { return this.teacherService.getAssignments(req.user.id); }

  @Get('classes/:id/assignments')
  getClassAssignments(@Param('id') id: string, @Req() req: any) {
    return this.teacherService.getClassAssignments(req.user.id, id);
  }

  @Post('assignments')
  createAssignment(@Req() req: any, @Body() data: any) {
    return this.teacherService.createAssignment(req.user.id, data);
  }

  @Patch('assignments/:id')
  updateAssignment(@Param('id') id: string, @Req() req: any, @Body() data: any) {
    return this.teacherService.updateAssignment(req.user.id, id, data);
  }

  @Delete('assignments/:id')
  deleteAssignment(@Param('id') id: string, @Req() req: any) {
    return this.teacherService.deleteAssignment(req.user.id, id);
  }

  @Get('assignments/:id/report')
  getAssignmentReport(
    @Param('id') id: string,
    @Req() req: any,
    @Query('status') status?: string,
    @Query('keyword') keyword?: string,
    @Query('completion') completion?: 'all' | 'completed' | 'incomplete',
    @Query('refresh') refresh?: string,
  ) {
    return this.teacherService.getAssignmentReport(req.user.id, id, {
      status,
      keyword,
      completion,
      refresh: refresh !== '0' && refresh !== 'false',
    });
  }

  @Get('assignments/:id/report.csv')
  async exportAssignmentReport(
    @Param('id') id: string,
    @Req() req: any,
    @Res() res: Response,
    @Query('status') status?: string,
    @Query('keyword') keyword?: string,
    @Query('completion') completion?: 'all' | 'completed' | 'incomplete',
  ) {
    const file = await this.teacherService.exportAssignmentReportCsv(req.user.id, id, {
      status,
      keyword,
      completion,
    });
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.send(file.csv);
  }

  @Post('assignments/:id/refresh')
  refreshAssignment(@Param('id') id: string, @Req() req: any) {
    return this.teacherService.refreshAssignmentProgress(req.user.id, id);
  }

  @Post('assignments/:id/settle')
  settleAssignment(@Param('id') id: string, @Req() req: any) {
    return this.teacherService.settleAssignment(req.user.id, id);
  }

  @Get('notifications/outbox')
  getNotificationOutbox(@Req() req: any) {
    return this.teacherService.getNotificationOutboxStats(req.user.id);
  }

  @Post('notifications/outbox/retry')
  retryNotificationOutbox(@Req() req: any, @Body() body: { limit?: number }) {
    return this.teacherService.retryNotificationOutbox(req.user.id, body?.limit);
  }

  // === 比赛 ===
  @Get('contests')
  getContests(@Req() req: any) { return this.teacherService.getContests(req.user.id); }

  @Post('contests')
  createContest(@Req() req: any, @Body() data: {
    title: string; description?: string; mode?: string; startTime: string; endTime: string;
    problemIds?: string[]; visibility?: string; registerStart?: string; registerEnd?: string;
    freezeTime?: string; allowUpsolve?: boolean; maxSubmissions?: number;
    penaltyTime?: number; password?: string; teamMode?: boolean; isRated?: boolean;
  }) {
    return this.teacherService.createContest(req.user, data);
  }
}
