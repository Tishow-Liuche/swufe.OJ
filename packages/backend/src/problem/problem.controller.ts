import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards, Req,
  UseInterceptors, UploadedFile,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { ProblemService } from './problem.service';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateProblemDto, UpdateProblemDto, QueryProblemDto } from './dto';

@Controller('api/problems')
export class ProblemController {
  constructor(private problem: ProblemService) {}

  /** 创建题目（教师/管理员） */
  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  create(@Body() dto: CreateProblemDto, @Req() req: any) {
    return this.problem.createFull(dto, req.user.id);
  }

  /** 上传测试数据 */
  @Post(':id/testdata')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
  uploadTestData(@Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
    return this.problem.uploadTestData(id, file);
  }

  /** 上传图片 */
  @Post('images/upload')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  uploadImage(@UploadedFile() file: Express.Multer.File) {
    return this.problem.uploadImage(file);
  }

  /** 上传标程 */
  @Post(':id/checker')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  uploadChecker(
    @Param('id') id: string, @UploadedFile() file: Express.Multer.File,
    @Body('type') type: string, @Body('language') language: string,
  ) { return this.problem.uploadChecker(id, file, type || 'STANDARD', language || 'cpp'); }

  /** 题库列表（公开） */
  @Get()
  findAll(@Query() query: QueryProblemDto) {
    return this.problem.findAll(query);
  }

  /** 题目详情（公开） */
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.problem.findOne(id);
  }

  /** 编辑题目（教师/管理员） */
  @Patch(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  update(@Param('id') id: string, @Body() dto: UpdateProblemDto) {
    return this.problem.update(id, dto);
  }

  /** 删除题目（教师/管理员） */
  @Delete(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  delete(@Param('id') id: string) {
    return this.problem.delete(id);
  }

  /** 修改题目状态（教师/管理员） */
  @Patch(':id/status')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  updateStatus(@Param('id') id: string, @Body('status') status: string) {
    return this.problem.updateStatus(id, status);
  }
}
