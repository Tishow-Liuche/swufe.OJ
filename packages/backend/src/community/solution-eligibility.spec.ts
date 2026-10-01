import { CommunityService } from './community.service';

describe('solution eligibility', () => {
  const student = { id: 'u1', role: 'STUDENT' };
  function setup(local: boolean, external: boolean) {
    const prisma = {
      submission: { findFirst: jest.fn().mockResolvedValue(local ? { id: 's1' } : null) },
      externalSolvedProblem: { findFirst: jest.fn().mockResolvedValue(external ? { id: 'e1' } : null) },
    };
    return { service: new CommunityService(prisma as any), prisma };
  }
  it('recognizes synced accepted problems in the same gate used by publishing', async () => {
    const { service, prisma } = setup(false, true);
    expect(await (service as any).hasSolved('u1', 'p1')).toBe(true);
    expect(prisma.externalSolvedProblem.findFirst).toHaveBeenCalledWith({ where: { userId: 'u1', problemId: 'p1' }, select: { id: true } });
  });
  it('keeps local contest AC eligible regardless of publication status', async () => {
    const { service, prisma } = setup(true, false);
    expect(await (service as any).solutionEligibility(student, 'p1')).toEqual({ canWriteSolution: true });
    expect(prisma.submission.findFirst).toHaveBeenCalledWith({ where: { userId: 'u1', problemId: 'p1', status: 'ACCEPTED' }, select: { id: true } });
  });
  it('does not allow an unsolved student', async () => {
    expect(await (setup(false, false).service as any).solutionEligibility(student, 'p1')).toEqual({ canWriteSolution: false });
  });
  it('retains moderator access', async () => {
    expect(await (setup(false, false).service as any).solutionEligibility({ id: 't1', role: 'TEACHER' }, 'p1')).toEqual({ canWriteSolution: true });
  });
  it('publishing uses the same external AC gate', async () => {
    const { service, prisma } = setup(false, true);
    Object.assign(prisma, {
      problem: { findUnique: jest.fn().mockResolvedValue({ id: 'p1' }) },
      communityPost: { create: jest.fn().mockResolvedValue({ id: 'post1' }) },
    });
    jest.spyOn(service as any, 'audit').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'notifyMentions').mockResolvedValue(undefined);
    expect(await service.createPost(student, { type: 'SOLUTION', problemId: 'p1', content: 'proof' })).toEqual({ id: 'post1' });
  });
  it('publishing refuses users without any accepted record', async () => {
    const { service, prisma } = setup(false, false);
    const create = jest.fn();
    Object.assign(prisma, { problem: { findUnique: jest.fn().mockResolvedValue({ id: 'p1' }) }, communityPost: { create } });
    await expect(service.createPost(student, { type: 'SOLUTION', problemId: 'p1', content: 'proof' })).rejects.toThrow('通过本题后才能发布题解');
    expect(create).not.toHaveBeenCalled();
  });
});
