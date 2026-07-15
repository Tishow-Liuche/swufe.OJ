import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ContestService } from './contest.service';

@Controller('api/contests')
export class ContestController {
  constructor(private readonly contests: ContestService) {}

  @Get()
  listPublic() {
    return this.contests.listPublic();
  }

  @Get('mine')
  @UseGuards(AuthGuard('jwt'))
  listMine(@Req() req: any) {
    return this.contests.listMine(req.user);
  }

  @Get('leaderboards/options')
  @UseGuards(AuthGuard('jwt'))
  options(@Req() req: any) {
    return this.contests.leaderboardOptions(req.user);
  }

  @Get('classes/:classId/leaderboard')
  @UseGuards(AuthGuard('jwt'))
  classLeaderboard(@Param('classId') classId: string, @Req() req: any) {
    return this.contests.classLeaderboard(classId, req.user);
  }

  @Get('problem-lists/:listId/leaderboard')
  @UseGuards(AuthGuard('jwt'))
  problemListLeaderboard(@Param('listId') listId: string, @Req() req: any) {
    return this.contests.problemListLeaderboard(listId, req.user);
  }

  @Post(':id/register')
  @UseGuards(AuthGuard('jwt'))
  register(@Param('id') id: string, @Req() req: any, @Body('password') password?: string) {
    return this.contests.register(id, req.user, password);
  }

  @Post(':id/virtual')
  @UseGuards(AuthGuard('jwt'))
  startVirtual(@Param('id') id: string, @Req() req: any) {
    return this.contests.startVirtual(id, req.user);
  }

  @Post(':id/submit')
  @UseGuards(AuthGuard('jwt'))
  submit(@Param('id') id: string, @Req() req: any, @Body() dto: { problemId: string; language: string; sourceCode: string }) {
    return this.contests.submit(id, req.user, dto);
  }

  @Get(':id/standings')
  standings(@Param('id') id: string, @Req() req: any) {
    return this.contests.standings(id, req.user);
  }

  @Post(':id/snapshot')
  @UseGuards(AuthGuard('jwt'))
  snapshot(@Param('id') id: string, @Req() req: any) {
    return this.contests.saveSnapshot(id, req.user);
  }

  @Get(':id')
  detail(@Param('id') id: string, @Req() req: any) {
    return this.contests.getContest(id, req.user);
  }
}
