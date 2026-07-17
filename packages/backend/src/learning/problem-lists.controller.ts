import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { LearningService } from './learning.service';
import { AddProblemListItemDto, CreateProblemListDto, ReorderProblemListDto, UpdateProblemListDto } from './dto';

@Controller('api/problem-lists')
export class ProblemListsController {
  constructor(private readonly learning: LearningService) {}

  @Get('public')
  publicLists() { return this.learning.getPublicLists(); }

  @Get('public/:id')
  publicOne(@Param('id') id: string) { return this.learning.getPublicList(id); }

  @Get()
  @UseGuards(AuthGuard('jwt'))
  mine(@Req() req: any) { return this.learning.getMineLists(req.user.id); }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'))
  getOne(@Param('id') id: string, @Req() req: any) { return this.learning.getList(id, req.user.id); }

  @Post()
  @UseGuards(AuthGuard('jwt'))
  create(@Req() req: any, @Body() dto: CreateProblemListDto) { return this.learning.createList(req.user.id, dto); }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'))
  update(@Param('id') id: string, @Req() req: any, @Body() dto: UpdateProblemListDto) { return this.learning.updateList(id, req.user.id, dto); }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  delete(@Param('id') id: string, @Req() req: any) { return this.learning.deleteList(id, req.user.id); }

  @Post(':id/items')
  @UseGuards(AuthGuard('jwt'))
  addItem(@Param('id') id: string, @Req() req: any, @Body() dto: AddProblemListItemDto) { return this.learning.addListItem(id, req.user.id, dto); }

  @Delete(':id/items/:itemId')
  @UseGuards(AuthGuard('jwt'))
  removeItem(@Param('id') id: string, @Param('itemId') itemId: string, @Req() req: any) { return this.learning.removeListItem(id, itemId, req.user.id); }

  @Patch(':id/items/reorder')
  @UseGuards(AuthGuard('jwt'))
  reorder(@Param('id') id: string, @Req() req: any, @Body() dto: ReorderProblemListDto) { return this.learning.reorderList(id, req.user.id, dto); }
}
