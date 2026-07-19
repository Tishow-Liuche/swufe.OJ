import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { LearningService } from './learning.service';

function makePrisma(overrides: Record<string, any> = {}) {
  const prisma = {
    problemList: {
      create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn(), delete: jest.fn(),
      ...overrides.problemList,
    },
    problemListItem: {
      findFirst: jest.fn(), findMany: jest.fn(), aggregate: jest.fn(), create: jest.fn(), delete: jest.fn(), update: jest.fn(),
      ...overrides.problemListItem,
    },
    problem: { findUnique: jest.fn(), findMany: jest.fn(), ...overrides.problem },
    learningPlan: { create: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn(), delete: jest.fn(), deleteMany: jest.fn(), ...overrides.learningPlan },
    learningPlanItem: { findFirst: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), createMany: jest.fn(), update: jest.fn(), delete: jest.fn(), ...overrides.learningPlanItem },
    learningPlanCheckIn: { count: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), upsert: jest.fn(), ...overrides.learningPlanCheckIn },
    userFavorite: { count: jest.fn(), findMany: jest.fn(), upsert: jest.fn(), deleteMany: jest.fn(), ...overrides.userFavorite },
    userWrongBook: { count: jest.fn(), findMany: jest.fn(), upsert: jest.fn(), deleteMany: jest.fn(), ...overrides.userWrongBook },
    submission: { findMany: jest.fn(), findUnique: jest.fn(), ...overrides.submission },
    $transaction: jest.fn(),
  } as any;
  prisma.$transaction.mockImplementation(async (operation: any) => (
    typeof operation === 'function' ? operation(prisma) : Promise.all(operation)
  ));
  return prisma;
}

describe('LearningService', () => {
  it('trims a list name and creates a private list', async () => {
    const prisma = makePrisma();
    prisma.problemList.create.mockResolvedValue({ id: 'list-1', name: '算法基础', isPublic: false });
    prisma.problemList.create.mockImplementation(async ({ data }: any) => data);
    const service = new LearningService(prisma);

    const result = await service.createList('user-1', { name: '  算法基础  ', isPublic: false });

    expect(result).toMatchObject({ name: '算法基础', createdBy: 'user-1', isPublic: false });
    expect(prisma.problemList.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ name: '算法基础', createdBy: 'user-1' }),
    }));
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

    await expect(service.addListItem('list-1', 'user-1', { problemId: 'problem-1' }))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.problemListItem.create).not.toHaveBeenCalled();
  });

  it('rejects reordering a list with another list item id', async () => {
    const prisma = makePrisma();
    prisma.problemList.findUnique.mockResolvedValue({ id: 'list-1', createdBy: 'user-1' });
    prisma.problemListItem.findMany.mockResolvedValue([{ id: 'item-1' }]);
    const service = new LearningService(prisma);

    await expect(service.reorderList('list-1', 'user-1', { items: [{ itemId: 'foreign', order: 0 }] }))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('prevents a non-owner from editing a learning plan', async () => {
    const prisma = makePrisma();
    prisma.learningPlan.findUnique.mockResolvedValue({ id: 'plan-1', userId: 'owner-1', startDate: new Date(), endDate: new Date() });
    const service = new LearningService(prisma);

    await expect(service.updatePlan('plan-1', 'other-user', { name: '改名' }))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a learning plan whose end date is before its start date', async () => {
    const service = new LearningService(makePrisma());
    await expect(service.createPlan('user-1', {
      name: '一周计划', startDate: '2026-07-20', endDate: '2026-07-19', dailyTarget: 3,
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('replaces the previous plan when a new plan is created', async () => {
    const prisma = makePrisma();
    prisma.learningPlan.deleteMany.mockResolvedValue({ count: 1 });
    prisma.learningPlan.create.mockImplementation(async ({ data }: any) => ({ id: 'plan-2', ...data }));
    const service = new LearningService(prisma);

    const result = await service.createPlan('user-1', {
      name: '暑期计划', startDate: '2026-07-15', endDate: '2026-07-21', dailyTarget: 4,
    });

    expect(prisma.learningPlan.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
    expect(prisma.learningPlan.create).toHaveBeenCalled();
    expect(result).toMatchObject({ id: 'plan-2', name: '暑期计划', dailyTarget: 4 });
  });

  it('generates new problems first and uses completed problems only as review fillers', async () => {
    const prisma = makePrisma();
    const plan = {
      id: 'plan-1', userId: 'user-1', dailyTarget: 2,
      startDate: new Date('2026-07-15T00:00:00.000Z'), endDate: new Date('2026-07-21T00:00:00.000Z'),
    };
    prisma.learningPlan.findFirst.mockResolvedValue(plan);
    prisma.learningPlanItem.findMany.mockImplementation(async ({ where, include }: any) => {
      if (include) return [];
      return [];
    });
    prisma.submission.findMany.mockResolvedValue([{ problemId: 'review-1' }]);
    prisma.userWrongBook.findMany.mockResolvedValue([{ problemId: 'review-1' }]);
    prisma.userFavorite.findMany.mockResolvedValue([]);
    prisma.problem.findMany
      .mockResolvedValueOnce([{ id: 'new-1' }])
      .mockResolvedValueOnce([{ id: 'review-1' }]);
    prisma.learningPlanItem.createMany.mockResolvedValue({ count: 2 });
    prisma.learningPlanCheckIn.findUnique.mockResolvedValue(null);
    const service = new LearningService(prisma);

    await service.generateDaily('user-1', new Date('2026-07-15T08:00:00.000Z'));

    expect(prisma.learningPlanItem.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ problemId: 'new-1', type: 'PRACTICE' }),
        expect.objectContaining({ problemId: 'review-1', type: 'REVIEW' }),
      ],
    });
  });

  it('uses upsert for idempotent favorites', async () => {
    const prisma = makePrisma();
    prisma.problem.findUnique.mockResolvedValue({ id: 'problem-1', status: 'PUBLISHED' });
    prisma.userFavorite.upsert.mockResolvedValue({ userId: 'user-1', problemId: 'problem-1' });
    const service = new LearningService(prisma);

    await service.addFavorite('user-1', { problemId: 'problem-1' });

    expect(prisma.userFavorite.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId_problemId: { userId: 'user-1', problemId: 'problem-1' } },
      update: {},
    }));
  });

  it('records learner-facing wrong verdicts but ignores accepted submissions', async () => {
    const prisma = makePrisma();
    prisma.submission.findUnique.mockResolvedValue({ userId: 'user-1', problemId: 'problem-1' });
    prisma.userWrongBook.upsert.mockResolvedValue({ id: 'wrong-1' });
    const service = new LearningService(prisma);

    await service.recordSubmissionResult('submission-1', 'WRONG_ANSWER');
    await service.recordSubmissionResult('submission-2', 'ACCEPTED');

    expect(prisma.userWrongBook.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.userWrongBook.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ userId: 'user-1', problemId: 'problem-1', errorType: 'WRONG_ANSWER' }),
    }));
  });
});
