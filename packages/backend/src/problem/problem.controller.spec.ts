import { ProblemController } from './problem.controller';

describe('ProblemController mutation actor propagation', () => {
  const actor = { id: 'teacher-1', role: 'TEACHER' };
  const file = { originalname: 'testdata.zip' } as Express.Multer.File;

  it('passes the authenticated actor to every problem-specific mutation', async () => {
    const problem: any = {
      createFull: jest.fn(),
      uploadTestData: jest.fn(),
      uploadChecker: jest.fn(),
      update: jest.fn(),
      updateStatus: jest.fn(),
      delete: jest.fn(),
      assignOwner: jest.fn(),
      grantPermission: jest.fn(),
      removePermission: jest.fn(),
    };
    const controller = new ProblemController(problem);

    await controller.create({ title: 'A', description: 'D' } as any, { user: actor });
    await controller.uploadTestData('p1', file, { user: actor } as any);
    await controller.uploadChecker('p1', file, 'STANDARD', 'cpp', { user: actor } as any);
    await controller.update('p1', { title: 'B' } as any, { user: actor });
    await controller.updateStatus('p1', 'PUBLISHED', { user: actor });
    await controller.delete('p1', { user: actor });
    const admin = { id: 'admin-1', role: 'ADMIN' };
    await controller.assignOwner('p1', { ownerId: 'teacher-2' } as any, { user: admin });
    await controller.grantPermission('p1', { targetId: 'teacher-2', permission: 'MANAGE' } as any, { user: actor });
    await controller.removePermission('p1', 'grant-1', { user: actor });

    expect(problem.createFull).toHaveBeenCalledWith(expect.anything(), actor);
    expect(problem.uploadTestData).toHaveBeenCalledWith('p1', file, actor);
    expect(problem.uploadChecker).toHaveBeenCalledWith('p1', file, 'STANDARD', 'cpp', actor);
    expect(problem.update).toHaveBeenCalledWith('p1', expect.anything(), actor);
    expect(problem.updateStatus).toHaveBeenCalledWith('p1', 'PUBLISHED', actor);
    expect(problem.delete).toHaveBeenCalledWith('p1', actor);
    expect(problem.assignOwner).toHaveBeenCalledWith('p1', 'teacher-2', admin);
    expect(problem.grantPermission).toHaveBeenCalledWith('p1', expect.anything(), actor);
    expect(problem.removePermission).toHaveBeenCalledWith('p1', 'grant-1', actor);
  });
});
