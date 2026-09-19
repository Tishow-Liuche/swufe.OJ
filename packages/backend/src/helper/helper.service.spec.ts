import { ForbiddenException } from '@nestjs/common';
import { HelperService } from './helper.service';

describe('HelperService deactivated users', () => {
  let service: HelperService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn() },
      helperDevice: {
        create: jest.fn(),
        findFirst: jest.fn(),
        updateMany: jest.fn(),
      },
      remoteSubmissionTask: { findFirst: jest.fn() },
    };
    service = new HelperService(prisma);
  });

  it('rejects device registration for a deactivated account', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'deleted-user', deletedAt: new Date() });

    await expect(service.registerDevice('deleted-user', {
      deviceName: 'Chrome', browserName: 'Chrome', extensionVersion: '1.0.0',
    })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.helperDevice.create).not.toHaveBeenCalled();
  });

  it('does not expose pending tasks for a deactivated account', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'deleted-user', deletedAt: new Date() });

    await expect(service.getNextTask('deleted-user', 'device-1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.remoteSubmissionTask.findFirst).not.toHaveBeenCalled();
  });

  it('does not revive a revoked helper device', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'active-user', deletedAt: null });
    prisma.helperDevice.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.heartbeat('revoked-device', 'active-user')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.helperDevice.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: { not: 'REVOKED' } }),
    }));
  });
});
