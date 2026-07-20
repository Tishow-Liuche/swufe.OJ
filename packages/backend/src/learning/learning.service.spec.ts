import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { LearningService } from './learning.service';

function makePrisma(overrides: Record<string, any> = {}) {
  const prisma = {
    problemList: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      ...overrides.problemList,
    },
    problemListItem: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      aggregate: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
      ...overrides.problemListItem,
    },
    problem: { findUnique: jest.fn(), findMany: jest.fn(), ...overrides.problem },
    learningPlan: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
      ...overrides.learningPlan,
    },
    problemDraft: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
      ...overrides.problemDraft,
    },
    dailyPracticeItem: {
      findMany: jest.fn(),
      createMany: jest.fn(),
      ...overrides.dailyPracticeItem,
    },
    userCheckIn: { findMany: jest.fn(), upsert: jest.fn(), ...overrides.userCheckIn },
    userFavorite: {
      count: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
      ...overrides.userFavorite,
    },
    userWrongBook: {
      count: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
      ...overrides.userWrongBook,
    },
    submission: { findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), groupBy: jest.fn(), ...overrides.submission },
    $transaction: jest.fn(),
  } as any;
  prisma.$transaction.mockImplementation(async (operation: any) =>
    typeof operation === 'function' ? operation(prisma) : Promise.all(operation),
  );
  return prisma;
}

describe('LearningService', () => {
  it('trims a list name and creates a private list', async () => {
    const prisma = makePrisma();
    prisma.problemList.create.mockImplementation(async ({ data }: any) => data);
    const service = new LearningService(prisma);

    const result = await service.createList('user-1', { name: '  算法基础  ', isPublic: false });

    expect(result).toMatchObject({ name: '算法基础', createdBy: 'user-1', isPublic: false });
    expect(prisma.problemList.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: '算法基础', createdBy: 'user-1' }) }),
    );
  });

  it('rejects an empty list name', async () => {
    const service = new LearningService(makePrisma());
    await expect(service.createList('user-1', { name: '   ' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects adding an unpublished problem to a list', async () => {
    const prisma = makePrisma();
    prisma.problemList.findUnique.mockResolvedValue({ id: 'list-1', createdBy: 'user-1' });
    prisma.problem.findUnique.mockResolvedValue({ id: 'problem-1', status: 'DRAFT' });
    const service = new LearningService(prisma);

    await expect(service.addListItem('list-1', 'user-1', { problemId: 'problem-1' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.problemListItem.create).not.toHaveBeenCalled();
  });

  it('rejects reordering a list with another list item id', async () => {
    const prisma = makePrisma();
    prisma.problemList.findUnique.mockResolvedValue({ id: 'list-1', createdBy: 'user-1' });
    prisma.problemListItem.findMany.mockResolvedValue([{ id: 'item-1' }]);
    const service = new LearningService(prisma);

    await expect(
      service.reorderList('list-1', 'user-1', { items: [{ itemId: 'foreign', order: 0 }] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('creates a plan from an accessible problem list and reactivates it idempotently', async () => {
    const prisma = makePrisma();
    const problemList = {
      id: 'list-1',
      name: '图论基础',
      isPublic: true,
      createdBy: 'owner-1',
      items: [{ id: 'item-1', problemId: 'problem-1' }],
    };
    prisma.problemList.findUnique.mockResolvedValue(problemList);
    prisma.learningPlan.upsert.mockResolvedValue({ id: 'plan-1' });
    prisma.learningPlan.findUnique.mockResolvedValue({
      id: 'plan-1',
      userId: 'user-1',
      problemListId: 'list-1',
      status: 'ACTIVE',
      problemList,
    });
    prisma.submission.findMany.mockResolvedValue([]);
    const service = new LearningService(prisma);

    const result = await service.createPlan('user-1', { problemListId: 'list-1' });

    expect(prisma.learningPlan.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_problemListId: { userId: 'user-1', problemListId: 'list-1' } },
        update: expect.objectContaining({ status: 'ACTIVE', completedAt: null }),
      }),
    );
    expect(result.progress).toEqual({ solved: 0, total: 1, percent: 0 });
  });

  it('rejects a private list owned by another user as a learning plan', async () => {
    const prisma = makePrisma();
    prisma.problemList.findUnique.mockResolvedValue({ id: 'list-1', isPublic: false, createdBy: 'owner-1' });
    const service = new LearningService(prisma);

    await expect(service.createPlan('user-1', { problemListId: 'list-1' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.learningPlan.upsert).not.toHaveBeenCalled();
  });

  it('prevents a non-owner from ending a learning plan', async () => {
    const prisma = makePrisma();
    prisma.learningPlan.findUnique.mockResolvedValue({ id: 'plan-1', userId: 'owner-1' });
    const service = new LearningService(prisma);

    await expect(service.updatePlan('plan-1', 'other-user', { status: 'COMPLETED' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('creates five daily problems once and keeps the same set for the day', async () => {
    const prisma = makePrisma();
    const problems = Array.from({ length: 5 }, (_, index) => ({ id: `problem-${index + 1}` }));
    const dailyItems = problems.map((problem, order) => ({
      id: `daily-${order + 1}`,
      problemId: problem.id,
      order,
      source: 'UNSOLVED',
      problem,
    }));
    prisma.dailyPracticeItem.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(dailyItems)
      .mockResolvedValueOnce(dailyItems);
    prisma.submission.findMany.mockResolvedValue([]);
    prisma.problem.findMany.mockResolvedValue(problems);
    prisma.dailyPracticeItem.createMany.mockResolvedValue({ count: 5 });
    const service = new LearningService(prisma);

    const first = await service.getDaily('user-1');
    const second = await service.getDaily('user-1');

    expect(first.items).toHaveLength(5);
    expect(second.items.map((item: any) => item.problemId)).toEqual(first.items.map((item: any) => item.problemId));
    expect(prisma.dailyPracticeItem.createMany).toHaveBeenCalledTimes(1);
    expect(prisma.dailyPracticeItem.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([expect.objectContaining({ source: 'UNSOLVED' })]),
        skipDuplicates: true,
      }),
    );
  });

  it('groups submission activity by problem when building continue learning', async () => {
    const prisma = makePrisma();
    const attemptedAt = new Date('2026-07-20T09:00:00.000Z');
    prisma.submission.findMany.mockResolvedValue([]);
    prisma.submission.groupBy
      .mockResolvedValueOnce([{ problemId: 'passed' }])
      .mockResolvedValueOnce([{ problemId: 'attempted', _max: { createdAt: attemptedAt } }]);
    prisma.problem.findMany.mockResolvedValue([{ id: 'attempted', title: 'Continue me' }]);
    const service = new LearningService(prisma);

    const result = await service.getContinueLearning('user-1');

    expect(prisma.submission.groupBy).toHaveBeenNthCalledWith(1, {
      by: ['problemId'],
      where: { userId: 'user-1', status: 'ACCEPTED' },
    });
    expect(prisma.submission.groupBy).toHaveBeenNthCalledWith(2, {
      by: ['problemId'],
      where: { userId: 'user-1', status: { not: 'ACCEPTED' } },
      _max: { createdAt: true },
    });
    expect(result.counts).toMatchObject({ attempted: 1 });
  });

  it('combines passed, attempted, favorite and wrong-book state per problem', async () => {
    const prisma = makePrisma();
    prisma.submission.findMany.mockResolvedValue([
      { problemId: 'passed', status: 'WRONG_ANSWER' },
      { problemId: 'passed', status: 'ACCEPTED' },
      { problemId: 'attempted', status: 'WRONG_ANSWER' },
    ]);
    prisma.problemDraft.findMany.mockResolvedValue([{ problemId: 'draft-only' }]);
    prisma.userFavorite.findMany.mockResolvedValue([{ problemId: 'passed' }]);
    prisma.userWrongBook.findMany.mockResolvedValue([{ problemId: 'attempted' }]);
    const service = new LearningService(prisma);

    const states = await service.getProblemStates('user-1', ['passed', 'attempted', 'draft-only', 'new']);

    expect(states.passed).toMatchObject({ status: 'PASSED', favorite: true, attempts: 2 });
    expect(states.attempted).toMatchObject({ status: 'ATTEMPTED', wrong: true });
    expect(states['draft-only']).toMatchObject({ status: 'ATTEMPTED', hasDraft: true });
    expect(states.new).toMatchObject({ status: 'NEW', favorite: false, wrong: false });
  });

  it('can favorite an accepted problem before removing it from the wrong book', async () => {
    const prisma = makePrisma();
    prisma.submission.findFirst.mockResolvedValue({ id: 'accepted-1' });
    prisma.userFavorite.upsert.mockResolvedValue({ id: 'favorite-1' });
    prisma.userWrongBook.deleteMany.mockResolvedValue({ count: 1 });
    prisma.submission.findMany.mockResolvedValue([{ problemId: 'problem-1', status: 'ACCEPTED' }]);
    prisma.userFavorite.findMany.mockResolvedValue([{ problemId: 'problem-1' }]);
    const service = new LearningService(prisma);

    const state = await service.resolveWrongBook('user-1', 'problem-1', true);

    expect(prisma.userFavorite.upsert).toHaveBeenCalled();
    expect(prisma.userWrongBook.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', problemId: 'problem-1' },
    });
    expect(state).toMatchObject({ status: 'PASSED', favorite: true, wrong: false });
  });

  it('uses a per-user per-day upsert for global check-in', async () => {
    const prisma = makePrisma();
    prisma.userCheckIn.upsert.mockResolvedValue({ id: 'check-in-1' });
    prisma.userCheckIn.findMany.mockResolvedValue([{ date: new Date() }]);
    const service = new LearningService(prisma);

    const result = await service.checkIn('user-1');

    expect(prisma.userCheckIn.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId_date: expect.objectContaining({ userId: 'user-1' }) }, update: {} }),
    );
    expect(result).toMatchObject({ checkedToday: true, totalDays: 1, streak: 1 });
  });

  it('counts distinct accepted problems in the dashboard totals', async () => {
    const prisma = makePrisma();
    prisma.userFavorite.count.mockResolvedValue(0);
    prisma.userWrongBook.count.mockResolvedValue(0);
    prisma.submission.findMany
      .mockResolvedValueOnce([{ problemId: 'problem-1' }])
      .mockResolvedValueOnce([{ problemId: 'problem-1' }, { problemId: 'problem-2' }]);
    const service = new LearningService(prisma);
    jest.spyOn(service, 'getDaily').mockResolvedValue({ items: [] } as any);
    jest.spyOn(service, 'getPlans').mockResolvedValue([] as any);
    jest.spyOn(service, 'getContinueLearning').mockResolvedValue({ items: [], counts: {} } as any);
    jest.spyOn(service, 'getCheckIn').mockResolvedValue({ checkedToday: false, totalDays: 3, streak: 0 } as any);

    const result = await service.getDashboard('user-1');

    expect(prisma.submission.findMany).toHaveBeenNthCalledWith(2, {
      where: { userId: 'user-1', status: 'ACCEPTED' },
      distinct: ['problemId'],
      select: { problemId: true },
    });
    expect(result.counts).toMatchObject({ todaySolved: 1, totalSolved: 2, checkInDays: 3 });
  });

  it('uses upsert for idempotent favorites', async () => {
    const prisma = makePrisma();
    prisma.problem.findUnique.mockResolvedValue({ id: 'problem-1', status: 'PUBLISHED' });
    prisma.userFavorite.upsert.mockResolvedValue({ userId: 'user-1', problemId: 'problem-1' });
    const service = new LearningService(prisma);

    await service.addFavorite('user-1', { problemId: 'problem-1' });

    expect(prisma.userFavorite.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_problemId: { userId: 'user-1', problemId: 'problem-1' } },
        update: {},
      }),
    );
  });

  it('records learner-facing wrong verdicts but ignores accepted submissions', async () => {
    const prisma = makePrisma();
    prisma.submission.findUnique.mockResolvedValue({ userId: 'user-1', problemId: 'problem-1' });
    prisma.userWrongBook.upsert.mockResolvedValue({ id: 'wrong-1' });
    const service = new LearningService(prisma);

    await service.recordSubmissionResult('submission-1', 'WRONG_ANSWER');
    await service.recordSubmissionResult('submission-2', 'ACCEPTED');

    expect(prisma.userWrongBook.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.userWrongBook.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ userId: 'user-1', problemId: 'problem-1', errorType: 'WRONG_ANSWER' }),
      }),
    );
  });
});
