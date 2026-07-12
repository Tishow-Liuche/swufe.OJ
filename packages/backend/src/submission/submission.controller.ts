import {
  Controller, Get, Post, Body, Param, Query, UseGuards, Req,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SubmissionService } from './submission.service';

@Controller('api/submissions')
export class SubmissionController {
  constructor(private submission: SubmissionService) {}

  @Post()
  @UseGuards(AuthGuard('jwt'))
  submit(@Req() req: any, @Body() dto: { problemId: string; language: string; sourceCode: string }) {
    return this.submission.submit(req.user.id, dto);
  }

  @Get()
  findAll(@Query() query: any) {
    return this.submission.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.submission.findOne(id);
  }
}
