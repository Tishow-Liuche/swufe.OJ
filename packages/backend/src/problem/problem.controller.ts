import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards, Req,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ProblemService } from './problem.service';
import { CreateProblemDto, UpdateProblemDto, QueryProblemDto } from './dto';

@Controller('api/problems')
export class ProblemController {
  constructor(private problem: ProblemService) {}

  @Post()
  @UseGuards(AuthGuard('jwt'))
  create(@Body() dto: CreateProblemDto, @Req() req: any) {
    return this.problem.create(dto, req.user.id);
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
