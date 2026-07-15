import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SubmissionService } from '../submission/submission.service';

type Viewer = { id: string; role?: string };

@Injectable()
export class ContestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly submissions: SubmissionService,
  ) {}

  private contestInclude = {
    problems: {
      orderBy: { order: 'asc' as const },
      include: {
        problem: { select: { id: true, title: true, difficulty: true, timeLimit: true, memoryLimit: true } },
      },
    },
    _count: { select: { participants: true, submissions: true } },
  };

  private stateOf(contest: any, participant?: any) {
    const now = new Date();
    const start = participant?.isVirtual && participant.virtualStart
      ? participant.virtualStart
      : contest.startTime;
    const end = participant?.isVirtual && participant.virtualEnd
      ? participant.virtualEnd
      : contest.endTime;
    if (now < start) return 'UPCOMING';
    if (now > end) return 'ENDED';
    return 'RUNNING';
  }

  private async withOrganizers(contests: any[]) {
    const organizerIds = [...new Set(contests.map((contest) => contest.createdBy))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: organizerIds } },
      select: { id: true, username: true, nickname: true },
    });
    const byId = new Map(users.map((user) => [user.id, user]));
    return contests.map((contest) => {
      const { password: _password, ...safeContest } = contest;
      return {
      ...safeContest,
      organizer: byId.get(contest.createdBy)
        ? { id: contest.createdBy, name: byId.get(contest.createdBy)!.nickname || byId.get(contest.createdBy)!.username }
        : { id: contest.createdBy, name: '平台赛事组' },
      };
    });
  }

  private assertCanViewStandings(contest: any, viewer: Viewer) {
    if (contest.visibility === 'PUBLIC') return;
    const isParticipant = contest.participants.some((participant: any) => participant.userId === viewer.id);
    const canManage = viewer.role === 'ADMIN' || contest.createdBy === viewer.id;
    if (!isParticipant && !canManage) throw new ForbiddenException('无权查看该私有比赛的排名');
  }

  async listPublic() {
    const contests = await this.prisma.contest.findMany({
      where: { visibility: 'PUBLIC' },
      include: this.contestInclude,
      orderBy: { startTime: 'desc' },
    });
    return this.withOrganizers(contests.map((contest) => ({
      ...contest,
      state: this.stateOf(contest),
    })));
  }

  async listMine(viewer: Viewer) {
    const contests = await this.prisma.contest.findMany({
      where: {
        OR: [
          { visibility: 'PUBLIC' },
          { createdBy: viewer.id },
          { participants: { some: { userId: viewer.id } } },
        ],
      },
      include: {
        ...this.contestInclude,
        participants: { where: { userId: viewer.id }, take: 1 },
      },
      orderBy: { startTime: 'desc' },
    });
    return this.withOrganizers(contests.map((contest: any) => {
      const participant = contest.participants[0];
      return {
        ...contest,
        participant: participant || null,
        state: this.stateOf(contest, participant),
      };
    }));
  }

  async getContest(id: string, viewer?: Viewer) {
    const contest = await this.prisma.contest.findUnique({
      where: { id },
      include: {
        ...this.contestInclude,
        participants: viewer ? { where: { userId: viewer.id }, take: 1 } : false,
      },
    });
    if (!contest) throw new NotFoundException('比赛不存在');

    const participant = viewer ? (contest as any).participants?.[0] : null;
    const canManage = viewer && (viewer.role === 'ADMIN' || contest.createdBy === viewer.id);
    if (contest.visibility !== 'PUBLIC' && !participant && !canManage) {
      throw new ForbiddenException('无权查看该比赛');
    }

    return (await this.withOrganizers([{
      ...contest,
      participant: participant || null,
      state: this.stateOf(contest, participant),
    }]))[0];
  }

  async register(id: string, viewer: Viewer, password?: string) {
    const contest = await this.prisma.contest.findUnique({ where: { id } });
    if (!contest) throw new NotFoundException('比赛不存在');
    const canManage = viewer.role === 'ADMIN' || contest.createdBy === viewer.id;
    if (contest.visibility === 'PRIVATE' && !canManage) {
      throw new ForbiddenException('该比赛为私有比赛，只有举办者或管理员可以报名');
    }
    if (contest.visibility !== 'PUBLIC' && contest.visibility !== 'PRIVATE' && !canManage && !contest.password) {
      throw new ForbiddenException('无权报名该比赛');
    }
    const now = new Date();
    if (contest.registerStart && now < contest.registerStart) {
      throw new BadRequestException('报名尚未开始');
    }
    if (contest.registerEnd && now > contest.registerEnd) {
      throw new BadRequestException('报名已结束');
    }
    if (contest.endTime < now) throw new BadRequestException('比赛已结束，不能报名');
    if (contest.password && !canManage && contest.password !== password) {
      throw new ForbiddenException('比赛密码不正确');
    }

    const participant = await this.prisma.contestParticipant.upsert({
      where: { contestId_userId: { contestId: id, userId: viewer.id } },
      create: { contestId: id, userId: viewer.id },
      update: {},
    });
    return { participant, state: this.stateOf(contest, participant) };
  }

  async startVirtual(id: string, viewer: Viewer) {
    const contest = await this.prisma.contest.findUnique({ where: { id } });
    if (!contest) throw new NotFoundException('比赛不存在');
    if (contest.visibility !== 'PUBLIC' && viewer.role !== 'ADMIN' && contest.createdBy !== viewer.id) {
      throw new ForbiddenException('无权发起该私有比赛的虚拟参赛');
    }
    if (new Date() < contest.endTime) {
      throw new BadRequestException('正式比赛尚未结束，暂不能发起虚拟比赛');
    }
    if (!contest.allowUpsolve) {
      throw new ForbiddenException('该比赛不允许虚拟参赛');
    }

    const existing = await this.prisma.contestParticipant.findUnique({
      where: { contestId_userId: { contestId: id, userId: viewer.id } },
    });
    if (existing?.isVirtual) throw new BadRequestException('虚拟比赛已经开始，参赛时间不可重复开启或续时');
    if (existing) throw new BadRequestException('你已参加过正式比赛，不能再发起同一场虚拟比赛');

    const duration = contest.endTime.getTime() - contest.startTime.getTime();
    const start = new Date();
    const participant = await this.prisma.contestParticipant.create({
      data: {
        contestId: id,
        userId: viewer.id,
        isVirtual: true,
        virtualStart: start,
        virtualEnd: new Date(start.getTime() + duration),
      },
    });
    return { participant, state: this.stateOf(contest, participant) };
  }

  async submit(id: string, viewer: Viewer, dto: { problemId: string; language: string; sourceCode: string }) {
    const contest = await this.prisma.contest.findUnique({ where: { id } });
    if (!contest) throw new NotFoundException('比赛不存在');
    const participant = await this.prisma.contestParticipant.findUnique({
      where: { contestId_userId: { contestId: id, userId: viewer.id } },
    });
    if (!participant) throw new ForbiddenException('请先报名或开始虚拟比赛');
    if (this.stateOf(contest, participant) !== 'RUNNING') {
      throw new BadRequestException('当前不在可提交时间内');
    }
    const contestProblem = await this.prisma.contestProblem.findUnique({
      where: { contestId_problemId: { contestId: id, problemId: dto.problemId } },
    });
    if (!contestProblem) throw new ForbiddenException('该题目不属于本场比赛');

    const submitted: any = await this.submissions.submit(viewer.id, dto);
    if (!submitted?.id) {
      throw new BadRequestException('当前比赛仅支持可追踪的本地评测提交');
    }
    await this.prisma.contestSubmission.create({
      data: { contestId: id, submissionId: submitted.id },
    });
    return { ...submitted, contestId: id };
  }

  async standings(id: string, viewer: Viewer) {
    const contest = await this.prisma.contest.findUnique({
      where: { id },
      include: {
        participants: {
          include: { user: { select: { id: true, username: true, nickname: true, avatar: true } } },
        },
        problems: { orderBy: { order: 'asc' } },
        submissions: {
          include: {
            submission: {
              select: { userId: true, problemId: true, status: true, score: true, createdAt: true },
            },
          },
        },
      },
    });
    if (!contest) throw new NotFoundException('比赛不存在');
    this.assertCanViewStandings(contest, viewer);
    const canManage = viewer && (viewer.role === 'ADMIN' || contest.createdBy === viewer.id);
    const now = new Date();
    const frozen = !!contest.freezeTime
      && now >= contest.freezeTime
      && now < contest.endTime
      && !canManage;

    const rows = contest.participants.map((participant: any) => {
      const start = participant.isVirtual && participant.virtualStart ? participant.virtualStart : contest.startTime;
      const end = participant.isVirtual && participant.virtualEnd ? participant.virtualEnd : contest.endTime;
      const cutoff = frozen && !participant.isVirtual ? contest.freezeTime! : end;
      const submissions = contest.submissions
        .map((item: any) => item.submission)
        .filter((submission: any) =>
          submission.userId === participant.userId
          && submission.createdAt >= start
          && submission.createdAt <= cutoff,
        )
        .sort((a: any, b: any) => a.createdAt.getTime() - b.createdAt.getTime());

      const problems = contest.problems.map((problem: any) => {
        const attempts = submissions.filter((submission: any) => submission.problemId === problem.problemId);
        const accepted = attempts.find((submission: any) => submission.status === 'ACCEPTED');
        const wrongAttempts = accepted
          ? attempts.filter((submission: any) => submission.createdAt < accepted.createdAt && submission.status !== 'ACCEPTED').length
          : attempts.filter((submission: any) => submission.status !== 'PENDING' && submission.status !== 'QUEUING').length;
        const bestScore = attempts.reduce((best: number, submission: any) => Math.max(best, submission.score || 0), 0);
        return {
          problemId: problem.problemId,
          accepted: !!accepted,
          attempts: attempts.length,
          wrongAttempts,
          score: bestScore,
          acceptedAt: accepted?.createdAt || null,
        };
      });

      if (contest.mode === 'IOI') {
        const score = problems.reduce((sum: number, problem: any) => sum + problem.score, 0);
        const lastActive = submissions.length ? submissions[submissions.length - 1].createdAt : null;
        return {
          user: participant.user,
          userId: participant.userId,
          isVirtual: participant.isVirtual,
          solvedCount: problems.filter((problem: any) => problem.accepted).length,
          score,
          penalty: 0,
          lastActive,
          problems,
        };
      }

      const solved = problems.filter((problem: any) => problem.accepted);
      const penalty = solved.reduce((sum: number, problem: any) => {
        const minutes = Math.floor((problem.acceptedAt.getTime() - start.getTime()) / 60_000);
        return sum + minutes + problem.wrongAttempts * contest.penaltyTime;
      }, 0);
      return {
        user: participant.user,
        userId: participant.userId,
        isVirtual: participant.isVirtual,
        solvedCount: solved.length,
        score: 0,
        penalty,
        lastActive: submissions.length ? submissions[submissions.length - 1].createdAt : null,
        problems,
      };
    });

    rows.sort((a: any, b: any) => contest.mode === 'IOI'
      ? b.score - a.score || (a.lastActive?.getTime() || Infinity) - (b.lastActive?.getTime() || Infinity)
      : b.solvedCount - a.solvedCount || a.penalty - b.penalty || (a.lastActive?.getTime() || Infinity) - (b.lastActive?.getTime() || Infinity));

    let previous: any;
    return {
      contest: { id: contest.id, title: contest.title, mode: contest.mode, frozen },
      rows: rows.map((row: any, index: number) => {
        const tied = previous && (contest.mode === 'IOI'
          ? previous.score === row.score && previous.lastActive?.getTime() === row.lastActive?.getTime()
          : previous.solvedCount === row.solvedCount && previous.penalty === row.penalty);
        const rank = tied ? previous.rank : index + 1;
        previous = { ...row, rank };
        return { rank, ...row };
      }),
    };
  }

  async saveSnapshot(id: string, viewer: Viewer) {
    const contest = await this.prisma.contest.findUnique({ where: { id } });
    if (!contest) throw new NotFoundException('比赛不存在');
    if (contest.createdBy !== viewer.id && viewer.role !== 'ADMIN') throw new ForbiddenException('无权保存排名快照');
    const standings = await this.standings(id, viewer);
    return this.prisma.contestRankSnapshot.create({
      data: { contestId: id, rankData: JSON.stringify(standings.rows) },
    });
  }

  async leaderboardOptions(viewer: Viewer) {
    const [memberClasses, taughtClasses, lists] = await Promise.all([
      this.prisma.classMember.findMany({ where: { userId: viewer.id }, include: { class: true } }),
      this.prisma.class.findMany({ where: { teacherId: viewer.id } }),
      this.prisma.problemList.findMany({
        where: { OR: [{ isPublic: true }, { createdBy: viewer.id }] },
        select: { id: true, name: true, isPublic: true },
        orderBy: { updatedAt: 'desc' },
        take: 100,
      }),
    ]);
    const classes = new Map<string, any>();
    [...memberClasses.map((item) => item.class), ...taughtClasses].forEach((item) => classes.set(item.id, item));
    return { classes: [...classes.values()], problemLists: lists };
  }

  private async practiceRows(userIds?: string[], problemIds?: string[]) {
    const where: any = {};
    if (userIds) where.userId = { in: userIds };
    if (problemIds) where.problemId = { in: problemIds };
    const [users, submissions] = await Promise.all([
      this.prisma.user.findMany({
        where: userIds ? { id: { in: userIds } } : {},
        select: { id: true, username: true, nickname: true, avatar: true, role: true },
      }),
      this.prisma.submission.findMany({
        where,
        select: { userId: true, problemId: true, status: true },
      }),
    ]);
    const byUser = new Map<string, any[]>();
    submissions.forEach((submission) => {
      const items = byUser.get(submission.userId) || [];
      items.push(submission);
      byUser.set(submission.userId, items);
    });
    const rows = users.map((user) => {
      const items = byUser.get(user.id) || [];
      const accepted = items.filter((item) => item.status === 'ACCEPTED');
      return {
        userId: user.id,
        username: user.username,
        nickname: user.nickname || user.username,
        avatar: user.avatar,
        role: user.role,
        solvedCount: new Set(accepted.map((item) => item.problemId)).size,
        submissionCount: items.length,
        acceptRate: items.length ? Math.round((accepted.length / items.length) * 100) : 0,
      };
    });
    rows.sort((a, b) => b.solvedCount - a.solvedCount || b.submissionCount - a.submissionCount || a.username.localeCompare(b.username));
    let previous: any;
    return rows.map((row, index) => {
      const rank = previous && previous.solvedCount === row.solvedCount && previous.submissionCount === row.submissionCount
        ? previous.rank
        : index + 1;
      previous = { ...row, rank };
      return { rank, ...row };
    });
  }

  globalLeaderboard() {
    return this.practiceRows();
  }

  async classLeaderboard(classId: string, viewer: Viewer) {
    const classroom = await this.prisma.class.findUnique({
      where: { id: classId },
      include: { members: { select: { userId: true } } },
    });
    if (!classroom) throw new NotFoundException('班级不存在');
    const isMember = classroom.members.some((member) => member.userId === viewer.id);
    if (!isMember && classroom.teacherId !== viewer.id && viewer.role !== 'ADMIN') {
      throw new ForbiddenException('仅班级成员、授课教师或管理员可查看');
    }
    return this.practiceRows(classroom.members.map((member) => member.userId));
  }

  async problemListLeaderboard(listId: string, viewer?: Viewer) {
    const list = await this.prisma.problemList.findUnique({
      where: { id: listId },
      include: { items: { select: { problemId: true } } },
    });
    if (!list) throw new NotFoundException('题单不存在');
    if (!list.isPublic && list.createdBy !== viewer?.id && viewer?.role !== 'ADMIN') {
      throw new ForbiddenException('无权查看该题单排行榜');
    }
    return this.practiceRows(undefined, list.items.map((item) => item.problemId));
  }
}
