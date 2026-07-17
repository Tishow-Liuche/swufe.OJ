import { ForbiddenException } from '@nestjs/common';
import { ProblemAccessService, type ProblemAction } from '../common/problem-access.service';

describe('ProblemAccessService', () => {
  const teacher = { id: 'teacher-a', role: 'TEACHER' };
  let prisma: any;
  let access: ProblemAccessService;

  beforeEach(() => {
    prisma = {
      problem: {
        findUnique: jest.fn(),
      },
    };
    access = new ProblemAccessService(prisma);
  });

  it.each([
    ['a legacy problem', { id: 'legacy', createdById: null, permissions: [] }, teacher, 'EDIT'],
    ['a legacy problem with a stale delegate', {
      id: 'legacy-with-grant',
      createdById: null,
      permissions: [{ targetType: 'USER', targetId: 'teacher-a', permission: 'MANAGE' }],
    }, teacher, 'EDIT'],
    ['another teacher\'s test data', { id: 'other-owner', createdById: 'teacher-b', permissions: [] }, teacher, 'MANAGE_TESTDATA'],
  ] as Array<[string, object, { id: string; role: string }, ProblemAction]>)
  ('rejects a teacher from managing %s', async (_label, problem, actor, action) => {
    prisma.problem.findUnique.mockResolvedValue(problem);

    await expect(access.assertCanManage('p1', actor, action)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows the owner, an explicit delegate, and an administrator', async () => {
    prisma.problem.findUnique
      .mockResolvedValueOnce({ id: 'p1', createdById: 'teacher-a', permissions: [] })
      .mockResolvedValueOnce({
        id: 'p1',
        createdById: 'teacher-b',
        permissions: [{ targetType: 'USER', targetId: 'teacher-a', permission: 'MANAGE_TESTDATA' }],
      })
      .mockResolvedValueOnce({ id: 'p1', createdById: null, permissions: [] });

    await expect(access.assertCanManage('p1', teacher, 'EDIT')).resolves.toMatchObject({ id: 'p1' });
    await expect(access.assertCanManage('p1', teacher, 'MANAGE_TESTDATA')).resolves.toMatchObject({ id: 'p1' });
    await expect(access.assertCanManage('p1', { id: 'admin', role: 'ADMIN' }, 'DELETE')).resolves.toMatchObject({ id: 'p1' });
  });

  it('does not let a delegated manager grant access to other users', async () => {
    prisma.problem.findUnique.mockResolvedValue({
      id: 'p1',
      createdById: 'teacher-b',
      permissions: [{ targetType: 'USER', targetId: 'teacher-a', permission: 'MANAGE' }],
    });

    await expect(access.assertCanChangePermissions('p1', teacher)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
