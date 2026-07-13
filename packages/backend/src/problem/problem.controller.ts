import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards, Req,
  UseInterceptors, UploadedFile,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { ProblemService } from './problem.service';
import { CreateProblemDto, UpdateProblemDto, QueryProblemDto } from './dto';

@Controller('api/problems')
export class ProblemController {
  constructor(private problem: ProblemService) {}

  /** 创建完整题目 */
  @Post()
  @UseGuards(AuthGuard('jwt'))
  create(@Body() dto: CreateProblemDto, @Req() req: any) {
    return this.problem.createFull(dto, req.user.id);
  }

  /** 上传测试数据 ZIP */
  @Post(':id/testdata')
  @UseGuards(AuthGuard('jwt'))
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
  uploadTestData(@Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
    return this.problem.uploadTestData(id, file);
  }

  /** 上传 Markdown 图片 */
  @Post('images/upload')
  @UseGuards(AuthGuard('jwt'))
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  uploadImage(@UploadedFile() file: Express.Multer.File) {
    return this.problem.uploadImage(file);
  }

  /** 上传标程/Checker */
  @Post(':id/checker')
  @UseGuards(AuthGuard('jwt'))
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  uploadChecker(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('type') type: string,
    @Body('language') language: string,
  ) {
    return this.problem.uploadChecker(id, file, type || 'STANDARD', language || 'cpp');
  }

  @Get()
  findAll(@Query() query: QueryProblemDto) {
    return this.problem.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.problem.findOne(id);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'))
  update(@Param('id') id: string, @Body() dto: UpdateProblemDto) {
    return this.problem.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  delete(@Param('id') id: string) {
    return this.problem.delete(id);
  }

  @Patch(':id/status')
  @UseGuards(AuthGuard('jwt'))
  updateStatus(@Param('id') id: string, @Body('status') status: string) {
    return this.problem.updateStatus(id, status);
  }
}
