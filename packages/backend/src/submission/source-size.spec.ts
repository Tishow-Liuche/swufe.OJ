import { SubmissionService } from './submission.service';

it.each(['x'.repeat(4 * 1024 * 1024 + 1), '汉'.repeat(2 * 1024 * 1024)])('rejects oversized UTF8 source before database or queue access', async sourceCode => {
  const lookup = jest.fn();
  const service = new SubmissionService({ problem: { findUnique: lookup } } as any, {} as any, {} as any, {} as any, {} as any);
  await expect(service.submit('u', { problemId: 'p', language: 'cpp', sourceCode })).rejects.toMatchObject({ status: 413 });
  expect(lookup).not.toHaveBeenCalled();
});

it('accepts exactly 4 MiB before routing a valid submission', async () => {
  const createTask = jest.fn().mockResolvedValue({ id: 's' });
  const service = new SubmissionService({ problem: { findUnique: jest.fn().mockResolvedValue({ status: 'PUBLISHED', sourceInfo: { platform: 'CODEFORCES' } }) } } as any, { createTask } as any, {} as any, {} as any, {} as any);
  await expect(service.submit('u', { problemId: 'p', language: 'cpp', sourceCode: 'x'.repeat(4 * 1024 * 1024) })).resolves.toEqual({ id: 's' });
});
