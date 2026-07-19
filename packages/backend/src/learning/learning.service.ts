import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  AddProblemListItemDto,
  CreateLearningPlanDto,
  CreateProblemListDto,
  ReorderProblemListDto,
  SaveProblemDraftDto,
  ToggleFavoriteDto,
  UpdateLearningPlanDto,
  UpdateProblemListDto,
  UpsertWrongBookDto,
} from './dto';

const problemSummary = {
  id: true,
  title: true,
  source: true,
  difficulty: true,
  status: true,
  timeLimit: true,
  memoryLimit: true,
  tags: { select: { name: true } },
} as const;

function startOfDay(value = new Date()) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfDay(value = new Date()) {
  const date = startOfDay(value);
  date.setDate(date.getDate() + 1);
  return date;
}

function dateKey(value: Date) {
  const date = startOfDay(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function databaseDate(value = new Date()) {
  const date = startOfDay(value);
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12));
}

function shuffled<T>(items: T[]) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

@Injectable()
export class LearningService {
  constructor(private readonly prisma: PrismaService) {}

  // ==================== 题单 ====================

  async getPublicLists() {
    return this.prisma.problemList.findMany({
      where: { isPublic: true },
      include: { _count: { select: { items: true } } },
      orderBy: [{ updatedAt: 'desc' }, { name: 'asc' }],
    });
  }

  async getPublicList(id: string) {
    const list = await this.prisma.problemList.findUnique({
      where: { id },
      include: {
        items: {
          orderBy: [{ order: 'asc' }, { id: 'asc' }],
          include: { problem: { select: problemSummary } },
        },
      },
    });
    if (!list || !list.isPublic) throw new NotFoundException('公开题单不存在');
    return list;
  }

  async getMineLists(userId: string) {
    return this.prisma.problemList.findMany({
      where: { createdBy: userId },
      include: { _count: { select: { items: true } } },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getList(id: string, userId?: string) {
    const list = await this.prisma.problemList.findUnique({
      where: { id },
      include: {
        items: {
          orderBy: [{ order: 'asc' }, { id: 'asc' }],
          include: { problem: { select: problemSummary } },
        },
      },
    });
    if (!list) throw new NotFoundException('题单不存在');
    if (!list.isPublic && list.createdBy !== userId) throw new ForbiddenException('该题单未公开');
    if (!userId) return list;
    const states = await this.getProblemStates(userId, list.items.map((item) => item.problemId));
    return {
      ...list,
      items: list.items.map((item) => ({ ...item, state: states[item.problemId] })),
    };
  }

  async createList(userId: string, dto: CreateProblemListDto) {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('题单名称不能为空');
    return this.prisma.problemList.create({
      data: {
        name,
        description: dto.description?.trim() || null,
        createdBy: userId,
        isPublic: dto.isPublic ?? false,
      },
      include: { items: true },
    });
  }

  async updateList(id: string, userId: string, dto: UpdateProblemListDto) {
    await this.assertListOwner(id, userId);
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) throw new BadRequestException('题单名称不能为空');
      data.name = name;
    }
    if (dto.description !== undefined) data.description = dto.description.trim() || null;
    if (dto.isPublic !== undefined) data.isPublic = dto.isPublic;
    return this.prisma.problemList.update({ where: { id }, data });
  }

  async deleteList(id: string, userId: string) {
    await this.assertListOwner(id, userId);
    await this.prisma.problemList.delete({ where: { id } });
    return { id, deleted: true };
  }

  async addListItem(listId: string, userId: string, dto: AddProblemListItemDto) {
    await this.assertListOwner(listId, userId);
    const problem = await this.prisma.problem.findUnique({
      where: { id: dto.problemId },
      select: { id: true, status: true },
    });
    if (!problem || problem.status !== 'PUBLISHED') throw new NotFoundException('题目不存在或尚未发布');
    const exists = await this.prisma.problemListItem.findFirst({ where: { listId, problemId: dto.problemId } });
    if (exists) {
      return this.prisma.problemListItem.findUnique({
        where: { id: exists.id },
        include: { problem: { select: problemSummary } },
      });
    }
    const max = await this.prisma.problemListItem.aggregate({ where: { listId }, _max: { order: true } });
    return this.prisma.problemListItem.create({
      data: { listId, problemId: dto.problemId, order: dto.order ?? (max._max.order ?? -1) + 1 },
      include: { problem: { select: problemSummary } },
    });
  }

  async removeListItem(listId: string, itemId: string, userId: string) {
    await this.assertListOwner(listId, userId);
    const item = await this.prisma.problemListItem.findUnique({ where: { id: itemId } });
    if (!item || item.listId !== listId) throw new NotFoundException('题单项目不存在');
    await this.prisma.problemListItem.delete({ where: { id: itemId } });
    return { id: itemId, deleted: true };
  }

  async reorderList(listId: string, userId: string, dto: ReorderProblemListDto) {
    await this.assertListOwner(listId, userId);
    const existing = await this.prisma.problemListItem.findMany({ where: { listId }, select: { id: true } });
    const validIds = new Set(existing.map((item) => item.id));
    if (dto.items.some((item) => !validIds.has(item.itemId))) {
      throw new BadRequestException('排序列表包含不属于该题单的项目');
    }
    const seen = new Set<string>();
    for (const item of dto.items) {
      if (seen.has(item.itemId)) throw new BadRequestException('排序列表包含重复项目');
      seen.add(item.itemId);
    }
    await this.prisma.$transaction(
      dto.items.map((item) =>
        this.prisma.problemListItem.update({ where: { id: item.itemId }, data: { order: item.order } }),
      ),
    );
    return this.getList(listId, userId);
  }

  private async assertListOwner(id: string, userId: string) {
    const list = await this.prisma.problemList.findUnique({
      where: { id },
      select: { id: true, createdBy: true },
    });
    if (!list) throw new NotFoundException('题单不存在');
    if (list.createdBy !== userId) throw new ForbiddenException('无权操作该题单');
    return list;
  }

  // ==================== 学习计划 ====================

  async getPlans(userId: string) {
    const plans = await this.prisma.learningPlan.findMany({
      where: { userId },
      include: {
        problemList: {
          include: { items: { select: { problemId: true }, orderBy: [{ order: 'asc' }, { id: 'asc' }] } },
        },
      },
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
    });
    const problemIds = [...new Set(plans.flatMap((plan) => plan.problemList.items.map((item) => item.problemId)))];
    const solvedIds = await this.getAcceptedProblemIds(userId, problemIds);
    return plans.map((plan) => this.formatPlan(plan, solvedIds));
  }

  async getPlanDetails(id: string, userId: string) {
    const plan = await this.prisma.learningPlan.findUnique({
      where: { id },
      include: {
        problemList: {
          include: {
            items: {
              orderBy: [{ order: 'asc' }, { id: 'asc' }],
              include: { problem: { select: problemSummary } },
            },
          },
        },
      },
    });
    if (!plan) throw new NotFoundException('学习计划不存在');
    if (plan.userId !== userId) throw new ForbiddenException('无权操作该学习计划');
    const problemIds = plan.problemList.items.map((item) => item.problemId);
    const states = await this.getProblemStates(userId, problemIds);
    const solvedIds = new Set(problemIds.filter((problemId) => states[problemId]?.status === 'PASSED'));
    return {
      ...this.formatPlan(plan, solvedIds),
      items: plan.problemList.items.map((item) => ({
        ...item,
        solved: solvedIds.has(item.problemId),
        state: states[item.problemId],
      })),
    };
  }

  async createPlan(userId: string, dto: CreateLearningPlanDto) {
    const list = await this.prisma.problemList.findUnique({
      where: { id: dto.problemListId },
      select: { id: true, isPublic: true, createdBy: true },
    });
    if (!list || (!list.isPublic && list.createdBy !== userId)) {
      throw new NotFoundException('题单不存在或尚未公开');
    }
    const plan = await this.prisma.learningPlan.upsert({
      where: { userId_problemListId: { userId, problemListId: list.id } },
      create: { userId, problemListId: list.id },
      update: { status: 'ACTIVE', startedAt: new Date(), completedAt: null },
    });
    return this.getPlanDetails(plan.id, userId);
  }

  async updatePlan(id: string, userId: string, dto: UpdateLearningPlanDto) {
    await this.assertPlanOwner(id, userId);
    const active = dto.status === 'ACTIVE';
    await this.prisma.learningPlan.update({
      where: { id },
      data: {
        status: dto.status,
        completedAt: active ? null : new Date(),
        startedAt: active ? new Date() : undefined,
      },
    });
    return this.getPlanDetails(id, userId);
  }

  private async assertPlanOwner(id: string, userId: string) {
    const plan = await this.prisma.learningPlan.findUnique({ where: { id }, select: { id: true, userId: true } });
    if (!plan) throw new NotFoundException('学习计划不存在');
    if (plan.userId !== userId) throw new ForbiddenException('无权操作该学习计划');
    return plan;
  }

  private async getAcceptedProblemIds(userId: string, problemIds: string[]) {
    if (!problemIds.length) return new Set<string>();
    const submissions = await this.prisma.submission.findMany({
      where: { userId, status: 'ACCEPTED', problemId: { in: problemIds } },
      distinct: ['problemId'],
      select: { problemId: true },
    });
    return new Set(submissions.map((item) => item.problemId));
  }

  private formatPlan(plan: any, solvedIds: Set<string>) {
    const items = plan.problemList?.items || [];
    const solved = items.filter((item: any) => solvedIds.has(item.problemId)).length;
    const total = items.length;
    return {
      ...plan,
      progress: { solved, total, percent: total ? Math.round((solved / total) * 100) : 0 },
    };
  }

  // ==================== 题目学习状态 ====================

  async getProblemStates(userId: string, problemIds: string[]) {
    const ids = [...new Set(problemIds.filter(Boolean))];
    if (!ids.length) return {};
    const [submissions, drafts, favorites, wrongItems] = await Promise.all([
      this.prisma.submission.findMany({
        where: { userId, problemId: { in: ids } },
        select: { problemId: true, status: true },
      }),
      this.prisma.problemDraft.findMany({
        where: { userId, problemId: { in: ids } },
        select: { problemId: true },
      }),
      this.prisma.userFavorite.findMany({
        where: { userId, problemId: { in: ids } },
        select: { problemId: true },
      }),
      this.prisma.userWrongBook.findMany({
        where: { userId, problemId: { in: ids } },
        select: { problemId: true },
      }),
    ]);
    const accepted = new Set(
      submissions.filter((item) => item.status === 'ACCEPTED').map((item) => item.problemId),
    );
    const attempted = new Set(submissions.map((item) => item.problemId));
    const draftIds = new Set(drafts.map((item) => item.problemId));
    const favoriteIds = new Set(favorites.map((item) => item.problemId));
    const wrongIds = new Set(wrongItems.map((item) => item.problemId));
    const attempts = new Map<string, number>();
    for (const submission of submissions) {
      attempts.set(submission.problemId, (attempts.get(submission.problemId) || 0) + 1);
    }
    return Object.fromEntries(
      ids.map((problemId) => [
        problemId,
        {
          status: accepted.has(problemId)
            ? 'PASSED'
            : attempted.has(problemId) || draftIds.has(problemId)
              ? 'ATTEMPTED'
              : 'NEW',
          favorite: favoriteIds.has(problemId),
          wrong: wrongIds.has(problemId),
          hasDraft: draftIds.has(problemId),
          attempts: attempts.get(problemId) || 0,
        },
      ]),
    );
  }

  async getProblemState(userId: string, problemId: string) {
    await this.assertPublishedProblem(problemId);
    const [states, draft] = await Promise.all([
      this.getProblemStates(userId, [problemId]),
      this.prisma.problemDraft.findUnique({ where: { userId_problemId: { userId, problemId } } }),
    ]);
    return { ...states[problemId], draft };
  }

  async saveProblemDraft(userId: string, problemId: string, dto: SaveProblemDraftDto) {
    await this.assertPublishedProblem(problemId);
    if (!dto.sourceCode.trim()) return this.deleteProblemDraft(userId, problemId);
    await this.prisma.problemDraft.upsert({
      where: { userId_problemId: { userId, problemId } },
      create: { userId, problemId, language: dto.language, sourceCode: dto.sourceCode },
      update: { language: dto.language, sourceCode: dto.sourceCode },
    });
    return this.getProblemState(userId, problemId);
  }

  async deleteProblemDraft(userId: string, problemId: string) {
    await this.prisma.problemDraft.deleteMany({ where: { userId, problemId } });
    return this.getProblemState(userId, problemId);
  }

  // ==================== 今日练习与继续学习 ====================

  async getDaily(userId: string) {
    const date = databaseDate();
    let items = await this.getDailyItems(userId, date);
    if (!items.length) {
      const accepted = await this.prisma.submission.findMany({
        where: { userId, status: 'ACCEPTED' },
        distinct: ['problemId'],
        select: { problemId: true },
      });
      const acceptedIds = accepted.map((item) => item.problemId);
      const unsolved = await this.prisma.problem.findMany({
        where: { status: 'PUBLISHED', id: { notIn: acceptedIds } },
        select: { id: true },
      });
      const selected = shuffled(unsolved)
        .slice(0, 5)
        .map((problem) => ({ problemId: problem.id, source: 'UNSOLVED' }));
      if (selected.length < 5 && acceptedIds.length) {
        const solved = await this.prisma.problem.findMany({
          where: { status: 'PUBLISHED', id: { in: acceptedIds } },
          select: { id: true },
        });
        selected.push(
          ...shuffled(solved)
            .slice(0, 5 - selected.length)
            .map((problem) => ({ problemId: problem.id, source: 'REVIEW' })),
        );
      }
      if (selected.length) {
        await this.prisma.dailyPracticeItem.createMany({
          data: selected.map((item, order) => ({ userId, date, order, ...item })),
          skipDuplicates: true,
        });
        items = await this.getDailyItems(userId, date);
      }
    }
    const states = await this.getProblemStates(userId, items.map((item) => item.problemId));
    return {
      date: dateKey(new Date()),
      items: items.map((item) => ({ ...item, state: states[item.problemId] })),
      progress: { total: items.length },
    };
  }

  private getDailyItems(userId: string, date: Date) {
    return this.prisma.dailyPracticeItem.findMany({
      where: { userId, date },
      include: { problem: { select: problemSummary } },
      orderBy: { order: 'asc' },
    });
  }

  async getContinueLearning(userId: string) {
    const [wrongItems, submissions, drafts] = await Promise.all([
      this.prisma.userWrongBook.findMany({
        where: { userId },
        include: { problem: { select: problemSummary } },
        orderBy: { lastAttemptAt: 'desc' },
      }),
      this.prisma.submission.findMany({
        where: { userId },
        select: { problemId: true, status: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.problemDraft.findMany({
        where: { userId },
        select: { problemId: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
      }),
    ]);
    const acceptedIds = new Set(
      submissions.filter((item) => item.status === 'ACCEPTED').map((item) => item.problemId),
    );
    const wrongIds = new Set(wrongItems.map((item) => item.problemId));
    const activity = new Map<string, Date>();
    for (const submission of submissions) {
      if (!activity.has(submission.problemId)) activity.set(submission.problemId, submission.createdAt);
    }
    for (const draft of drafts) {
      const current = activity.get(draft.problemId);
      if (!current || draft.updatedAt > current) activity.set(draft.problemId, draft.updatedAt);
    }
    const attemptedIds = [...activity.keys()].filter(
      (problemId) => !acceptedIds.has(problemId) && !wrongIds.has(problemId),
    );
    const attemptedProblems = attemptedIds.length
      ? await this.prisma.problem.findMany({
          where: { id: { in: attemptedIds }, status: 'PUBLISHED' },
          select: problemSummary,
        })
      : [];
    const attemptedById = new Map(attemptedProblems.map((problem) => [problem.id, problem]));
    const problemIds = [...wrongIds, ...attemptedIds];
    const states = await this.getProblemStates(userId, problemIds);
    const wrong = wrongItems.map((item) => ({
      ...item,
      reason: 'WRONG',
      state: states[item.problemId],
    }));
    const attempted = attemptedIds
      .map((problemId) => ({
        problemId,
        problem: attemptedById.get(problemId),
        updatedAt: activity.get(problemId),
        reason: 'ATTEMPTED',
        state: states[problemId],
      }))
      .filter((item) => item.problem)
      .sort((left, right) => Number(right.updatedAt) - Number(left.updatedAt));
    return { items: [...wrong, ...attempted], counts: { wrong: wrong.length, attempted: attempted.length } };
  }

  async getDashboard(userId: string) {
    const today = startOfDay();
    const [daily, plans, continueLearning, favoriteCount, wrongCount, solvedToday, checkIn] = await Promise.all([
      this.getDaily(userId),
      this.getPlans(userId),
      this.getContinueLearning(userId),
      this.prisma.userFavorite.count({ where: { userId } }),
      this.prisma.userWrongBook.count({ where: { userId } }),
      this.prisma.submission.findMany({
        where: { userId, status: 'ACCEPTED', createdAt: { gte: today, lt: endOfDay(today) } },
        distinct: ['problemId'],
        select: { problemId: true },
      }),
      this.getCheckIn(userId),
    ]);
    return {
      daily,
      plans,
      continueLearning,
      checkIn,
      counts: {
        favorites: favoriteCount,
        wrongBook: wrongCount,
        todaySolved: solvedToday.length,
        checkInDays: checkIn.totalDays,
      },
    };
  }

  // ==================== 全站签到 ====================

  async getCheckIn(userId: string) {
    const checkIns = await this.prisma.userCheckIn.findMany({ where: { userId }, orderBy: { date: 'desc' } });
    const checkedDates = new Set(checkIns.map((item) => dateKey(item.date)));
    const today = startOfDay();
    const checkedToday = checkedDates.has(dateKey(today));
    const cursor = new Date(today);
    if (!checkedToday) cursor.setDate(cursor.getDate() - 1);
    let streak = 0;
    while (checkedDates.has(dateKey(cursor))) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return {
      checkedToday,
      totalDays: checkIns.length,
      streak,
      recentDates: checkIns.slice(0, 90).map((item) => dateKey(item.date)),
    };
  }

  async checkIn(userId: string) {
    const date = databaseDate();
    await this.prisma.userCheckIn.upsert({
      where: { userId_date: { userId, date } },
      create: { userId, date },
      update: {},
    });
    return this.getCheckIn(userId);
  }

  // ==================== 收藏与错题 ====================

  async getFavorites(userId: string) {
    const items = await this.prisma.userFavorite.findMany({
      where: { userId },
      include: { problem: { select: problemSummary } },
      orderBy: { createdAt: 'desc' },
    });
    const states = await this.getProblemStates(userId, items.map((item) => item.problemId));
    return items.map((item) => ({ ...item, state: states[item.problemId] }));
  }

  async addFavorite(userId: string, dto: ToggleFavoriteDto) {
    await this.assertPublishedProblem(dto.problemId);
    return this.prisma.userFavorite.upsert({
      where: { userId_problemId: { userId, problemId: dto.problemId } },
      create: { userId, problemId: dto.problemId },
      update: {},
      include: { problem: { select: problemSummary } },
    });
  }

  async removeFavorite(userId: string, problemId: string) {
    await this.prisma.userFavorite.deleteMany({ where: { userId, problemId } });
    return { userId, problemId, favorite: false };
  }

  async getWrongBook(userId: string) {
    const items = await this.prisma.userWrongBook.findMany({
      where: { userId },
      include: { problem: { select: problemSummary } },
      orderBy: { lastAttemptAt: 'desc' },
    });
    const states = await this.getProblemStates(userId, items.map((item) => item.problemId));
    return items.map((item) => ({ ...item, state: states[item.problemId] }));
  }

  async upsertWrongBook(userId: string, dto: UpsertWrongBookDto) {
    await this.assertPublishedProblem(dto.problemId);
    return this.prisma.userWrongBook.upsert({
      where: { userId_problemId: { userId, problemId: dto.problemId } },
      create: { userId, problemId: dto.problemId, errorType: dto.errorType || 'WRONG_ANSWER' },
      update: { errorType: dto.errorType || undefined, lastAttemptAt: new Date() },
      include: { problem: { select: problemSummary } },
    });
  }

  async removeWrongBook(userId: string, problemId: string) {
    await this.prisma.userWrongBook.deleteMany({ where: { userId, problemId } });
    return { userId, problemId, removed: true };
  }

  async resolveWrongBook(userId: string, problemId: string, favorite: boolean) {
    const accepted = await this.prisma.submission.findFirst({
      where: { userId, problemId, status: 'ACCEPTED' },
      select: { id: true },
    });
    if (!accepted) throw new BadRequestException('题目通过后才能完成错题处理');
    await this.prisma.$transaction(async (tx) => {
      if (favorite) {
        await tx.userFavorite.upsert({
          where: { userId_problemId: { userId, problemId } },
          create: { userId, problemId },
          update: {},
        });
      }
      await tx.userWrongBook.deleteMany({ where: { userId, problemId } });
    });
    const states = await this.getProblemStates(userId, [problemId]);
    return states[problemId];
  }

  async recordWrongAnswer(userId: string, problemId: string, errorType: string) {
    return this.prisma.userWrongBook.upsert({
      where: { userId_problemId: { userId, problemId } },
      create: { userId, problemId, errorType, lastAttemptAt: new Date() },
      update: { errorType, lastAttemptAt: new Date() },
    });
  }

  async recordSubmissionResult(submissionId: string, status: string) {
    const wrongStatuses = new Set([
      'WRONG_ANSWER',
      'TIME_LIMIT_EXCEEDED',
      'MEMORY_LIMIT_EXCEEDED',
      'RUNTIME_ERROR',
      'COMPILE_ERROR',
      'OUTPUT_LIMIT_EXCEEDED',
      'PRESENTATION_ERROR',
    ]);
    if (!wrongStatuses.has(status)) return null;
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      select: { userId: true, problemId: true },
    });
    if (!submission) return null;
    return this.recordWrongAnswer(submission.userId, submission.problemId, status);
  }

  private async assertPublishedProblem(problemId: string) {
    const problem = await this.prisma.problem.findUnique({
      where: { id: problemId },
      select: { id: true, status: true },
    });
    if (!problem || problem.status !== 'PUBLISHED') throw new NotFoundException('题目不存在或尚未发布');
    return problem;
  }
}
