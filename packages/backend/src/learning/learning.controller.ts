import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  CreateLearningPlanDto,
  ProblemStatesDto,
  ResolveWrongBookDto,
  SaveProblemDraftDto,
  ToggleFavoriteDto,
  UpdateLearningPlanDto,
  UpsertWrongBookDto,
} from './dto';
import { LearningService } from './learning.service';

@Controller('api/learning')
@UseGuards(AuthGuard('jwt'))
export class LearningController {
  constructor(private readonly learning: LearningService) {}

  @Get('dashboard')
  dashboard(@Req() req: any) {
    return this.learning.getDashboard(req.user.id);
  }

  @Get('daily')
  daily(@Req() req: any) {
    return this.learning.getDaily(req.user.id);
  }

  @Get('continue-learning')
  continueLearning(@Req() req: any) {
    return this.learning.getContinueLearning(req.user.id);
  }

  @Post('problem-states')
  problemStates(@Req() req: any, @Body() dto: ProblemStatesDto) {
    return this.learning.getProblemStates(req.user.id, dto.problemIds);
  }

  @Get('problem-states/:problemId')
  problemState(@Req() req: any, @Param('problemId') problemId: string) {
    return this.learning.getProblemState(req.user.id, problemId);
  }

  @Put('problem-drafts/:problemId')
  saveDraft(@Req() req: any, @Param('problemId') problemId: string, @Body() dto: SaveProblemDraftDto) {
    return this.learning.saveProblemDraft(req.user.id, problemId, dto);
  }

  @Delete('problem-drafts/:problemId')
  deleteDraft(@Req() req: any, @Param('problemId') problemId: string) {
    return this.learning.deleteProblemDraft(req.user.id, problemId);
  }

  @Get('check-in')
  checkIn(@Req() req: any) {
    return this.learning.getCheckIn(req.user.id);
  }

  @Post('check-in')
  createCheckIn(@Req() req: any) {
    return this.learning.checkIn(req.user.id);
  }

  @Get('plans')
  plans(@Req() req: any) {
    return this.learning.getPlans(req.user.id);
  }

  @Get('plans/:id')
  plan(@Req() req: any, @Param('id') id: string) {
    return this.learning.getPlanDetails(id, req.user.id);
  }

  @Post('plans')
  createPlan(@Req() req: any, @Body() dto: CreateLearningPlanDto) {
    return this.learning.createPlan(req.user.id, dto);
  }

  @Patch('plans/:id')
  updatePlan(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateLearningPlanDto) {
    return this.learning.updatePlan(id, req.user.id, dto);
  }

  @Get('favorites')
  favorites(@Req() req: any) {
    return this.learning.getFavorites(req.user.id);
  }

  @Post('favorites')
  addFavorite(@Req() req: any, @Body() dto: ToggleFavoriteDto) {
    return this.learning.addFavorite(req.user.id, dto);
  }

  @Delete('favorites/:problemId')
  removeFavorite(@Req() req: any, @Param('problemId') problemId: string) {
    return this.learning.removeFavorite(req.user.id, problemId);
  }

  @Get('wrong-book')
  wrongBook(@Req() req: any) {
    return this.learning.getWrongBook(req.user.id);
  }

  @Post('wrong-book')
  addWrongBook(@Req() req: any, @Body() dto: UpsertWrongBookDto) {
    return this.learning.upsertWrongBook(req.user.id, dto);
  }

  @Delete('wrong-book/:problemId')
  removeWrongBook(@Req() req: any, @Param('problemId') problemId: string) {
    return this.learning.removeWrongBook(req.user.id, problemId);
  }

  @Post('wrong-book/:problemId/resolve')
  resolveWrongBook(
    @Req() req: any,
    @Param('problemId') problemId: string,
    @Body() dto: ResolveWrongBookDto,
  ) {
    return this.learning.resolveWrongBook(req.user.id, problemId, dto.favorite);
  }
}
