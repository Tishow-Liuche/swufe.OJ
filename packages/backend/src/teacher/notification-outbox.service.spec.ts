import { NotificationOutboxService } from './notification-outbox.service';

describe('NotificationOutboxService', () => {
  let service: NotificationOutboxService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      notification: {
        createMany: jest.fn(),
        create: jest.fn(),
      },
      notificationOutbox: {
        create: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
    };
    service = new NotificationOutboxService(prisma);
  });

  it('delivers notifications in bulk when createMany succeeds', async () => {
    prisma.notification.createMany.mockResolvedValue({ count: 2 });
    const result = await service.deliverMany([
      { userId: 'u1', type: 'ASSIGNMENT', title: 't1' },
      { userId: 'u2', type: 'ASSIGNMENT', title: 't2' },
    ]);
    expect(result).toEqual({ sent: 2, queued: 0, failed: 0 });
    expect(prisma.notificationOutbox.create).not.toHaveBeenCalled();
  });

  it('queues outbox rows when createMany fails', async () => {
    prisma.notification.createMany.mockRejectedValue(new Error('db down'));
    prisma.notificationOutbox.create.mockResolvedValue({});
    const result = await service.deliverMany([
      { userId: 'u1', type: 'ASSIGNMENT', title: 't1', refType: 'ASSIGNMENT', refId: 'a1' },
    ]);
    expect(result.sent).toBe(0);
    expect(result.queued).toBe(1);
    expect(prisma.notificationOutbox.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u1',
        status: 'PENDING',
        attempts: 1,
        refId: 'a1',
      }),
    });
  });

  it('retries pending outbox rows and marks them sent', async () => {
    prisma.notificationOutbox.findMany.mockResolvedValue([
      {
        id: 'ob1',
        userId: 'u1',
        type: 'ASSIGNMENT',
        title: '作业',
        content: 'x',
        link: '/a',
        attempts: 1,
      },
    ]);
    prisma.notification.create.mockResolvedValue({});
    prisma.notificationOutbox.update.mockResolvedValue({});

    const result = await service.retryPending(10);
    expect(result).toEqual({ processed: 1, sent: 1, failed: 0 });
    expect(prisma.notificationOutbox.update).toHaveBeenCalledWith({
      where: { id: 'ob1' },
      data: expect.objectContaining({ status: 'SENT', attempts: 2 }),
    });
  });
});
