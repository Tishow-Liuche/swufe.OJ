import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { LearningService } from './learning.service';
import {
  AddLearningPlanItemDto,
  CheckInLearningPlanDto,
  CreateLearningPlanDto,
  CreateProblemNoteDto,
  ToggleFavoriteDto,
  UpdateLearningPlanDto,
  UpdateProblemNoteDto,
  UpsertWrongBookDto,
} from './dto';

@Controller('api/learning')
@UseGuards(AuthGuard('jwt'))
export class LearningController {
  constructor(private readonly learning: LearningService) {}

  @Get('dashboard')
  dashboard(@Req() req: any) { return this.learning.getDashboard(req.user.id); }

  @Get('daily')
  daily(@Req() req: any, @Query('date') date?: string) { return this.learning.getDaily(req.user.id, date ? new Date(date) : new Date()); }

  @Post('daily/generate')
  generateDaily(@Req() req: any, @Query('date') date?: string) { return this.learning.generateDaily(req.user.id, date ? new Date(date) : new Date()); }

  @Get('plans')
  plans(@Req() req: any) { return this.learning.getPlans(req.user.id); }

  @Get('plans/:id')
  plan(@Req() req: any, @Param('id') id: string) { return this.learning.getPlanDetails(id, req.user.id); }

  @Post('plans')
  createPlan(@Req() req: any, @Body() dto: CreateLearningPlanDto) { return this.learning.createPlan(req.user.id, dto); }

  @Patch('plans/:id')
  updatePlan(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateLearningPlanDto) { return this.learning.updatePlan(id, req.user.id, dto); }

  @Delete('plans/:id')
  deletePlan(@Req() req: any, @Param('id') id: string) { return this.learning.deletePlan(id, req.user.id); }

  @Post('plans/:id/check-in')
  checkInPlan(@Req() req: any, @Param('id') id: string, @Body() dto: CheckInLearningPlanDto) {
    return this.learning.checkInPlan(id, req.user.id, dto.date ? new Date(dto.date) : new Date());
  }

  @Post('plans/:id/items')
  addPlanItem(@Req() req: any, @Param('id') id: string, @Body() dto: AddLearningPlanItemDto) { return this.learning.addPlanItem(id, req.user.id, dto); }

  @Patch('plans/:planId/items/:itemId')
  updatePlanItem(@Req() req: any, @Param('planId') planId: string, @Param('itemId') itemId: string, @Body('completed') completed: boolean) {
    return this.learning.updatePlanItem(planId, itemId, req.user.id, completed === true);
  }

  @Delete('plans/:planId/items/:itemId')
  removePlanItem(@Req() req: any, @Param('planId') planId: string, @Param('itemId') itemId: string) {
    return this.learning.removePlanItem(planId, itemId, req.user.id);
  }

  @Get('favorites')
  favorites(@Req() req: any) { return this.learning.getFavorites(req.user.id); }

  @Post('favorites')
  addFavorite(@Req() req: any, @Body() dto: ToggleFavoriteDto) { return this.learning.addFavorite(req.user.id, dto); }

  @Delete('favorites/:problemId')
  removeFavorite(@Req() req: any, @Param('problemId') problemId: string) { return this.learning.removeFavorite(req.user.id, problemId); }

  @Get('wrong-book')
  wrongBook(@Req() req: any) { return this.learning.getWrongBook(req.user.id); }

  @Post('wrong-book')
  addWrongBook(@Req() req: any, @Body() dto: UpsertWrongBookDto) { return this.learning.upsertWrongBook(req.user.id, dto); }

  @Delete('wrong-book/:problemId')
  removeWrongBook(@Req() req: any, @Param('problemId') problemId: string) { return this.learning.removeWrongBook(req.user.id, problemId); }

  @Get('notes')
  notes(@Req() req: any, @Query('due') due?: string) { return this.learning.getNotes(req.user.id, due === 'true'); }

  @Post('notes')
  createNote(@Req() req: any, @Body() dto: CreateProblemNoteDto) { return this.learning.createNote(req.user.id, dto); }

  @Patch('notes/:id')
  updateNote(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateProblemNoteDto) { return this.learning.updateNote(id, req.user.id, dto); }

  @Delete('notes/:id')
  deleteNote(@Req() req: any, @Param('id') id: string) { return this.learning.deleteNote(id, req.user.id); }

  @Post('notes/:id/review')
  reviewNote(@Req() req: any, @Param('id') id: string) { return this.learning.reviewNote(id, req.user.id); }
}
