import { NotFoundException } from '@nestjs/common';
import { CfHelperController } from './cf-helper.controller';

describe('CfHelperController', () => {
  function makeController(lease: any) {
    return new CfHelperController(lease);
  }

  it('does not expose Codeforces credentials', () => {
    const controller: any = makeController({});

    expect(controller.getCredentials).toBeUndefined();
  });

  it('returns lookup data with token and language display name', async () => {
    const controller = makeController({
      lookup: jest.fn(async () => ({
        submissionId: 'sub_1',
        remoteProblemId: '4A',
        language: 'cpp',
        sourceCode: 'int main(){}',
        status: 'PENDING',
        token: 'task-token',
      })),
    });

    await expect(controller.lookup('4A')).resolves.toEqual({
      submissionId: 'sub_1',
      remoteProblemId: '4A',
      language: 'cpp',
      sourceCode: 'int main(){}',
      status: 'PENDING',
      token: 'task-token',
      langName: 'GNU G++17',
    });
  });

  it('delegates lease acquisition', async () => {
    const lease = {
      acquireLease: jest.fn(async () => ({
        submissionId: 'sub_1',
        leaseNonce: 'lease-a',
        leaseExpiresAt: new Date('2026-07-14T12:02:00Z'),
      })),
    };
    const controller = makeController(lease);

    const result = await controller.acquireLease('sub_1', {
      token: 'task-token',
      leaseNonce: 'old',
    });

    expect(lease.acquireLease).toHaveBeenCalledWith('sub_1', 'task-token', 'old');
    expect(result.leaseNonce).toBe('lease-a');
  });

  it('delegates SID report and accepts TESTING-stage SID reports', async () => {
    const lease = {
      bindSid: jest.fn(async () => ({
        ok: true,
        submissionId: 'sub_1',
        cfSubmissionId: '123456',
        status: 'JUDGING',
      })),
    };
    const controller = makeController(lease);

    const result = await controller.reportSid('sub_1', {
      token: 'task-token',
      leaseNonce: 'lease-a',
      cfSubmissionId: '123456',
    });

    expect(lease.bindSid).toHaveBeenCalledWith('sub_1', 'task-token', 'lease-a', '123456');
    expect(result.status).toBe('JUDGING');
  });

  it('supports legacy SID report body while users update the browser script', async () => {
    const lease = {
      bindSidLegacy: jest.fn(async () => ({
        ok: true,
        submissionId: 'sub_1',
        cfSubmissionId: '123456',
        status: 'JUDGING',
        legacy: true,
      })),
    };
    const controller = makeController(lease);

    const result: any = await controller.reportSid('sub_1', {
      cfSubmissionId: '123456',
    } as any);

    expect(lease.bindSidLegacy).toHaveBeenCalledWith('sub_1', '123456');
    expect(result.legacy).toBe(true);
  });

  it('passes lookup miss through as NotFoundException', async () => {
    const controller = makeController({
      lookup: jest.fn(async () => {
        throw new NotFoundException('No pending CF task for problem 4A');
      }),
    });

    await expect(controller.lookup('4A')).rejects.toBeInstanceOf(NotFoundException);
  });
});
