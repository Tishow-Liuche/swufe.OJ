import { Controller, Get, Post, Body, Param, Query, UseGuards, Req, ForbiddenException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SubmissionService } from './submission.service';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

@Controller('api/submissions')
export class SubmissionController {
  constructor(private submission: SubmissionService) {}

  /** 提交代码（所有登录用户） */
  @Post()
  @UseGuards(AuthGuard('jwt'))
  submit(@Req() req: any, @Body() dto: { problemId: string; language: string; sourceCode: string }) {
    return this.submission.submit(req.user.id, dto);
  }

  /** 比赛预备题验题提交：仅题目作者或管理员可用，不暴露到公开题库 */
  @Post('preview')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  submitPreview(@Req() req: any, @Body() dto: { problemId: string; language: string; sourceCode: string }) {
    return this.submission.submit(req.user.id, dto, { authorPreviewActor: req.user });
  }

  /** 提交列表（需登录，学生只能看自己，教师/管理员看全部） */
  @Get()
  @UseGuards(AuthGuard('jwt'))
  findAll(@Query() query: any, @Req() req: any) {
    const isTeacherOrAdmin = req.user.role === 'TEACHER' || req.user.role === 'ADMIN';
    if (!isTeacherOrAdmin) {
      query.userId = req.user.id;
    }
    return this.submission.findAll(query);
  }

  /** 提交详情（所有者 + 教师/管理员） */
  @Get(':id')
  @UseGuards(AuthGuard('jwt'))
  async findOne(@Param('id') id: string, @Req() req: any) {
    const sub = await this.submission.findOne(id);
    const isOwner = sub.userId === req.user.id;
    const isTeacherOrAdmin = req.user.role === 'TEACHER' || req.user.role === 'ADMIN';
    if (!isOwner && !isTeacherOrAdmin) {
      throw new ForbiddenException('无权查看此提交');
    }
    if (!isTeacherOrAdmin && (sub as any).cases) {
      (sub as any).cases = (sub as any).cases.map((c: any) => ({
        caseIndex: c.caseIndex, status: c.status, timeUsed: c.timeUsed, memoryUsed: c.memoryUsed,
      }));
    }
    return sub;
  }

  /** 重判（教师/管理员） */
  @Post(':id/rejudge')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  rejudge(@Param('id') id: string) {
    return this.submission.rejudge(id);
  }
}
