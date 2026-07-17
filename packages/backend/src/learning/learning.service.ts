import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  AddLearningPlanItemDto,
  AddProblemListItemDto,
  CreateLearningPlanDto,
  CreateProblemListDto,
  CreateProblemNoteDto,
  ReorderProblemListDto,
  ToggleFavoriteDto,
  UpdateLearningPlanDto,
  UpdateProblemListDto,
  UpdateProblemNoteDto,
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

function dateDiffInDays(start: Date, end: Date) {
  return Math.max(0, Math.floor((startOfDay(end).getTime() - startOfDay(start).getTime()) / 86400000));
}

function dateKey(value: Date) {
  const date = startOfDay(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
    if (!list.isPublic && list.createdBy !== userId) {
      throw new ForbiddenException('该题单未公开');
    }
    return list;
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
    const problem = await this.prisma.problem.findUnique({ where: { id: dto.problemId }, select: { id: true, status: true } });
    if (!problem || problem.status !== 'PUBLISHED') throw new NotFoundException('题目不存在或尚未发布');
    const exists = await this.prisma.problemListItem.findFirst({ where: { listId, problemId: dto.problemId } });
    if (exists) return this.prisma.problemListItem.findUnique({ where: { id: exists.id }, include: { problem: { select: problemSummary } } });
    const max = await this.prisma.problemListItem.aggregate({ where: { listId }, _max: { order: true } });
    return this.prisma.problemListItem.create({
      data: { listId, problemId: dto.problemId, order: dto.order ?? ((max._max.order ?? -1) + 1) },
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
      dto.items.map((item) => this.prisma.problemListItem.update({ where: { id: item.itemId }, data: { order: item.order } })),
    );
    return this.getList(listId, userId);
  }

  private async assertListOwner(id: string, userId: string) {
    const list = await this.prisma.problemList.findUnique({ where: { id }, select: { id: true, createdBy: true } });
    if (!list) throw new NotFoundException('题单不存在');
    if (list.createdBy !== userId) throw new ForbiddenException('无权操作该题单');
    return list;
  }

  // ==================== 学习计划 ====================

  async getPlans(userId: string) {
    const plans = await this.prisma.learningPlan.findMany({
      where: { userId },
      include: { _count: { select: { items: true, checkIns: true } } },
      orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
      take: 1,
    });
    return plans.map((plan) => ({
      ...plan,
      progress: this.formatPlanProgress(plan.startDate, plan.endDate, plan._count.checkIns),
    }));
  }

  async getPlanDetails(id: string, userId: string) {
    const plan = await this.assertPlanOwner(id, userId);
    const [items, checkIns] = await Promise.all([
      this.prisma.learningPlanItem.findMany({
        where: { planId: id },
        include: { problem: { select: problemSummary } },
        orderBy: [{ dayIndex: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.learningPlanCheckIn.findMany({
        where: { planId: id },
        orderBy: { date: 'desc' },
      }),
    ]);
    const today = this.isDateInPlan(plan, new Date())
      ? await this.buildDaily(userId, plan, new Date())
      : this.emptyDaily(new Date(), plan);
    return {
      ...plan,
      items,
      checkIns,
      today,
      progress: this.formatPlanProgress(plan.startDate, plan.endDate, checkIns.length),
    };
  }

  async createPlan(userId: string, dto: CreateLearningPlanDto) {
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    if (endDate < startDate) throw new BadRequestException('结束日期不能早于开始日期');
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('学习计划名称不能为空');
    return this.prisma.$transaction(async (tx) => {
      await tx.learningPlan.deleteMany({ where: { userId } });
      return tx.learningPlan.create({
        data: {
          userId,
          name,
          description: dto.description?.trim() || null,
          type: dto.type || 'DAILY',
          startDate,
          endDate,
          dailyTarget: dto.dailyTarget || 3,
        },
        include: { items: { include: { problem: { select: problemSummary } }, orderBy: [{ dayIndex: 'asc' }, { id: 'asc' }] } },
      });
    });
  }

  async updatePlan(id: string, userId: string, dto: UpdateLearningPlanDto) {
    const plan = await this.assertPlanOwner(id, userId);
    const startDate = dto.startDate ? new Date(dto.startDate) : plan.startDate;
    const endDate = dto.endDate ? new Date(dto.endDate) : plan.endDate;
    if (endDate < startDate) throw new BadRequestException('结束日期不能早于开始日期');
    const name = dto.name?.trim();
    if (dto.name !== undefined && !name) throw new BadRequestException('学习计划名称不能为空');
    return this.prisma.learningPlan.update({
      where: { id },
      data: {
        name,
        description: dto.description === undefined ? undefined : (dto.description.trim() || null),
        startDate,
        endDate,
        dailyTarget: dto.dailyTarget,
      },
    });
  }

  async deletePlan(id: string, userId: string) {
    await this.assertPlanOwner(id, userId);
    await this.prisma.learningPlan.delete({ where: { id } });
    return { id, deleted: true };
  }

  async checkInPlan(planId: string, userId: string, date = new Date()) {
    const plan = await this.assertPlanOwner(planId, userId);
    if (startOfDay(date) > startOfDay(new Date())) {
      throw new BadRequestException('不能提前为未来日期打卡');
    }
    if (!this.isDateInPlan(plan, date)) throw new BadRequestException('当前日期不在计划范围内');
    const daily = await this.buildDaily(userId, plan, date);
    if (!daily.progress.canCheckIn) throw new BadRequestException('完成今日目标后才能打卡');
    const day = startOfDay(date);
    const checkIn = await this.prisma.learningPlanCheckIn.upsert({
      where: { planId_date: { planId, date: day } },
      create: { planId, date: day },
      update: {},
    });
    const checkedInDays = await this.prisma.learningPlanCheckIn.count({ where: { planId } });
    return {
      checkIn,
      progress: this.formatPlanProgress(plan.startDate, plan.endDate, checkedInDays),
    };
  }

  async addPlanItem(planId: string, userId: string, dto: AddLearningPlanItemDto) {
    const plan = await this.assertPlanOwner(planId, userId);
    const problem = await this.prisma.problem.findUnique({ where: { id: dto.problemId }, select: { id: true, status: true } });
    if (!problem || problem.status !== 'PUBLISHED') throw new NotFoundException('题目不存在或尚未发布');
    const dayIndex = Math.min(dto.dayIndex ?? 0, dateDiffInDays(plan.startDate, plan.endDate));
    const duplicate = await this.prisma.learningPlanItem.findFirst({ where: { planId, problemId: dto.problemId, dayIndex } });
    if (duplicate) return this.getPlanItem(duplicate.id, userId);
    const item = await this.prisma.learningPlanItem.create({
      data: { planId, problemId: dto.problemId, dayIndex, type: dto.type || 'PRACTICE' },
    });
    return this.getPlanItem(item.id, userId);
  }

  async updatePlanItem(planId: string, itemId: string, userId: string, completed: boolean) {
    await this.assertPlanOwner(planId, userId);
    const item = await this.prisma.learningPlanItem.findUnique({ where: { id: itemId } });
    if (!item || item.planId !== planId) throw new NotFoundException('学习计划项目不存在');
    await this.prisma.learningPlanItem.update({ where: { id: itemId }, data: { completed } });
    return this.getPlanItem(itemId, userId);
  }

  async removePlanItem(planId: string, itemId: string, userId: string) {
    await this.assertPlanOwner(planId, userId);
    const item = await this.prisma.learningPlanItem.findUnique({ where: { id: itemId } });
    if (!item || item.planId !== planId) throw new NotFoundException('学习计划项目不存在');
    await this.prisma.learningPlanItem.delete({ where: { id: itemId } });
    return { id: itemId, deleted: true };
  }

  private async getPlanItem(id: string, userId: string) {
    const item = await this.prisma.learningPlanItem.findUnique({
      where: { id },
      include: { plan: { select: { userId: true } }, problem: { select: problemSummary } },
    });
    if (!item || item.plan.userId !== userId) throw new NotFoundException('学习计划项目不存在');
    return item;
  }

  private async assertPlanOwner(id: string, userId: string) {
    const plan = await this.prisma.learningPlan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('学习计划不存在');
    if (plan.userId !== userId) throw new ForbiddenException('无权操作该学习计划');
    return plan;
  }

  private isDateInPlan(plan: { startDate: Date; endDate: Date }, date: Date) {
    const day = startOfDay(date);
    return day >= startOfDay(plan.startDate) && day < endOfDay(plan.endDate);
  }

  private formatPlanProgress(startDate: Date, endDate: Date, checkedInDays: number) {
    const totalDays = dateDiffInDays(startDate, endDate) + 1;
    return {
      checkedInDays,
      totalDays,
      percent: totalDays ? Math.min(100, Math.round((checkedInDays / totalDays) * 100)) : 0,
    };
  }

  private emptyDaily(date: Date, plan: any = null) {
    const day = startOfDay(date);
    return {
      date: dateKey(day),
      dayIndex: plan ? dateDiffInDays(plan.startDate, day) : 0,
      plan,
      items: [],
      checkIn: null,
      progress: {
        total: 0,
        target: plan?.dailyTarget || 0,
        completed: 0,
        percent: 0,
        canCheckIn: false,
        checkedIn: false,
      },
    };
  }

  private async buildDaily(userId: string, plan: any, date: Date) {
    const day = startOfDay(date);
    const dayIndex = dateDiffInDays(plan.startDate, day);
    const [items, submissions, completedBefore, checkIn] = await Promise.all([
      this.prisma.learningPlanItem.findMany({
        where: { planId: plan.id, dayIndex },
        include: { problem: { select: problemSummary } },
        orderBy: { id: 'asc' },
      }),
      this.prisma.submission.findMany({
        where: { userId },
        distinct: ['problemId'],
        select: { problemId: true },
      }),
      this.prisma.learningPlanItem.findMany({
        where: { planId: plan.id, completed: true, dayIndex: { lt: dayIndex } },
        select: { problemId: true },
      }),
      this.prisma.learningPlanCheckIn.findUnique({
        where: { planId_date: { planId: plan.id, date: day } },
      }),
    ]);
    const previouslyDone = new Set([
      ...submissions.map((item) => item.problemId),
      ...completedBefore.map((item) => item.problemId).filter(Boolean),
    ]);
    const completed = items.filter((item) => item.completed).length;
    const total = items.length;
    const required = Math.min(plan.dailyTarget, total);
    return {
      date: dateKey(day),
      dayIndex,
      plan,
      items: items.map((item) => ({
        ...item,
        previouslyDone: item.problemId ? previouslyDone.has(item.problemId) : false,
      })),
      checkIn,
      progress: {
        total,
        target: plan.dailyTarget,
        completed,
        percent: total ? Math.min(100, Math.round((completed / total) * 100)) : 0,
        canCheckIn: required > 0 && completed >= required,
        checkedIn: Boolean(checkIn),
      },
    };
  }

  async getDaily(userId: string, date = new Date()) {
    const day = startOfDay(date);
    const plan = await this.prisma.learningPlan.findFirst({
      where: { userId, startDate: { lte: endOfDay(day) }, endDate: { gte: day } },
      orderBy: { createdAt: 'desc' },
    });
    if (!plan) return this.emptyDaily(day);
    return this.buildDaily(userId, plan, day);
  }

  async generateDaily(userId: string, date = new Date()) {
    const day = startOfDay(date);
    const plan = await this.prisma.learningPlan.findFirst({
      where: { userId, startDate: { lte: endOfDay(day) }, endDate: { gte: day } },
      orderBy: { createdAt: 'desc' },
    });
    if (!plan) throw new BadRequestException('请先创建当前日期有效的学习计划');
    const dayIndex = dateDiffInDays(plan.startDate, day);
    const existing = await this.prisma.learningPlanItem.findMany({ where: { planId: plan.id, dayIndex }, select: { problemId: true } });
    const existingIds = new Set(existing.map((item) => item.problemId).filter(Boolean) as string[]);
    const count = Math.max(0, plan.dailyTarget - existingIds.size);
    if (!count) return this.getDaily(userId, day);

    const [submissions, completedItems, wrong, favorites] = await Promise.all([
      this.prisma.submission.findMany({ where: { userId }, distinct: ['problemId'], select: { problemId: true } }),
      this.prisma.learningPlanItem.findMany({ where: { planId: plan.id, completed: true }, select: { problemId: true } }),
      this.prisma.userWrongBook.findMany({ where: { userId }, orderBy: { lastAttemptAt: 'desc' }, select: { problemId: true } }),
      this.prisma.userFavorite.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, select: { problemId: true } }),
    ]);
    const doneIds = new Set([
      ...submissions.map((item) => item.problemId),
      ...completedItems.map((item) => item.problemId).filter(Boolean),
    ] as string[]);
    const newProblems = await this.prisma.problem.findMany({
      where: { status: 'PUBLISHED', id: { notIn: [...existingIds, ...doneIds] } },
      orderBy: { createdAt: 'desc' },
      take: count,
      select: problemSummary,
    });
    const remaining = count - newProblems.length;
    const reviewPriority = [
      ...wrong.map((item) => item.problemId),
      ...favorites.map((item) => item.problemId),
      ...doneIds,
    ].filter((id, index, all) => doneIds.has(id) && !existingIds.has(id) && all.indexOf(id) === index);
    const reviewPool = remaining && reviewPriority.length
      ? await this.prisma.problem.findMany({
          where: { status: 'PUBLISHED', id: { in: reviewPriority } },
          select: problemSummary,
        })
      : [];
    const reviewById = new Map(reviewPool.map((problem) => [problem.id, problem]));
    const reviewProblems = reviewPriority.map((id) => reviewById.get(id)).filter(Boolean).slice(0, remaining) as Array<{ id: string }>;
    if (newProblems.length || reviewProblems.length) {
      await this.prisma.learningPlanItem.createMany({
        data: [
          ...newProblems.map((problem) => ({ planId: plan.id, problemId: problem.id, dayIndex, type: 'PRACTICE' })),
          ...reviewProblems.map((problem) => ({ planId: plan.id, problemId: problem.id, dayIndex, type: 'REVIEW' })),
        ],
      });
    }
    return this.getDaily(userId, day);
  }

  async getDashboard(userId: string) {
    const [daily, plans, favoriteCount, wrongCount, dueNotes, solved] = await Promise.all([
      this.getDaily(userId),
      this.getPlans(userId),
      this.prisma.userFavorite.count({ where: { userId } }),
      this.prisma.userWrongBook.count({ where: { userId } }),
      this.prisma.problemNote.count({ where: { userId, reviewStatus: 'ACTIVE', nextReviewAt: { lte: new Date() } } }),
      this.prisma.submission.findMany({ where: { userId, status: 'ACCEPTED' }, distinct: ['problemId'], select: { problemId: true } }),
    ]);
    return { daily, plans, counts: { favorites: favoriteCount, wrongBook: wrongCount, dueNotes, solved: solved.length } };
  }

  // ==================== 收藏与错题 ====================

  async getFavorites(userId: string) {
    return this.prisma.userFavorite.findMany({ where: { userId }, include: { problem: { select: problemSummary } }, orderBy: { createdAt: 'desc' } });
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
    return this.prisma.userWrongBook.findMany({ where: { userId }, include: { problem: { select: problemSummary } }, orderBy: { lastAttemptAt: 'desc' } });
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
    const problem = await this.prisma.problem.findUnique({ where: { id: problemId }, select: { id: true, status: true } });
    if (!problem || problem.status !== 'PUBLISHED') throw new NotFoundException('题目不存在或尚未发布');
    return problem;
  }

  // ==================== 笔记与复习 ====================

  async getNotes(userId: string, dueOnly = false) {
    return this.prisma.problemNote.findMany({
      where: { userId, ...(dueOnly ? { reviewStatus: 'ACTIVE', nextReviewAt: { lte: new Date() } } : {}) },
      include: { problem: { select: problemSummary } },
      orderBy: [{ nextReviewAt: 'asc' }, { updatedAt: 'desc' }],
    });
  }

  async createNote(userId: string, dto: CreateProblemNoteDto) {
    await this.assertPublishedProblem(dto.problemId);
    const content = dto.content.trim();
    if (!content) throw new BadRequestException('笔记内容不能为空');
    return this.prisma.problemNote.create({
      data: { userId, problemId: dto.problemId, content, nextReviewAt: dto.nextReviewAt ? new Date(dto.nextReviewAt) : new Date(Date.now() + 86400000) },
      include: { problem: { select: problemSummary } },
    });
  }

  async updateNote(id: string, userId: string, dto: UpdateProblemNoteDto) {
    const note = await this.prisma.problemNote.findUnique({ where: { id }, select: { userId: true } });
    if (!note) throw new NotFoundException('笔记不存在');
    if (note.userId !== userId) throw new ForbiddenException('无权操作该笔记');
    return this.prisma.problemNote.update({
      where: { id },
      data: { content: dto.content === undefined ? undefined : dto.content.trim(), nextReviewAt: dto.nextReviewAt ? new Date(dto.nextReviewAt) : undefined, reviewStatus: dto.reviewStatus },
      include: { problem: { select: problemSummary } },
    });
  }

  async deleteNote(id: string, userId: string) {
    const note = await this.prisma.problemNote.findUnique({ where: { id }, select: { userId: true } });
    if (!note) throw new NotFoundException('笔记不存在');
    if (note.userId !== userId) throw new ForbiddenException('无权操作该笔记');
    await this.prisma.problemNote.delete({ where: { id } });
    return { id, deleted: true };
  }

  async reviewNote(id: string, userId: string) {
    const note = await this.prisma.problemNote.findUnique({ where: { id } });
    if (!note) throw new NotFoundException('笔记不存在');
    if (note.userId !== userId) throw new ForbiddenException('无权操作该笔记');
    const intervals = [1, 3, 7, 14, 30];
    const interval = intervals[Math.min(note.reviewCount, intervals.length - 1)];
    const nextReviewAt = new Date();
    nextReviewAt.setDate(nextReviewAt.getDate() + interval);
    return this.prisma.problemNote.update({
      where: { id },
      data: { lastReviewedAt: new Date(), nextReviewAt, reviewCount: { increment: 1 }, reviewStatus: 'ACTIVE' },
      include: { problem: { select: problemSummary } },
    });
  }
}
