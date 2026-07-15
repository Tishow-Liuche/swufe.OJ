import { Controller, Get, Post, Body, Param, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
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
  importStudents(@Param('id') id: string, @Req() req: any, @Body() data: { students: Array<{ studentId: string; name: string; college: string; phone: string; email: string }> }) {
    return this.teacherService.importStudents(id, req.user.id, data.students);
  }

  @Get('classes/:id/members')
  getMembers(@Param('id') id: string, @Req() req: any) {
    return this.teacherService.getClassMembers(id, req.user.id);
  }

  // === 作业 ===
  @Get('assignments')
  getAssignments(@Req() req: any) { return this.teacherService.getAssignments(req.user.id); }

  @Post('assignments')
  createAssignment(@Req() req: any, @Body() data: any) {
    return this.teacherService.createAssignment(req.user.id, data);
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
    return this.teacherService.createContest(req.user.id, data);
  }
}
