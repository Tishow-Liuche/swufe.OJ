import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type OutboxNotificationInput = {
  userId: string;
  type: string;
  title: string;
  content?: string | null;
  link?: string | null;
  refType?: string | null;
  refId?: string | null;
};

/**
 * Reliable delivery helper for class/assignment notifications.
 * createMany failures are recorded in NotificationOutbox for later retry.
 */
@Injectable()
export class NotificationOutboxService {
  private readonly logger = new Logger(NotificationOutboxService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Best-effort bulk delivery. Returns counts; never throws for delivery failure.
   */
  async deliverMany(items: OutboxNotificationInput[]): Promise<{
    sent: number;
    queued: number;
    failed: number;
  }> {
    if (!items.length) return { sent: 0, queued: 0, failed: 0 };

    try {
      await this.prisma.notification.createMany({
        data: items.map((item) => ({
          userId: item.userId,
          type: item.type,
          title: item.title,
          content: item.content || null,
          link: item.link || null,
        })),
      });
      return { sent: items.length, queued: 0, failed: 0 };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Notification createMany failed (${items.length} items): ${message}`);

      let queued = 0;
      let failed = 0;
      for (const item of items) {
        try {
          await this.prisma.notificationOutbox.create({
            data: {
              userId: item.userId,
              type: item.type,
              title: item.title,
              content: item.content || null,
              link: item.link || null,
              status: 'PENDING',
              attempts: 1,
              lastError: message.slice(0, 1000),
              refType: item.refType || null,
              refId: item.refId || null,
            },
          });
          queued += 1;
        } catch (outboxError) {
          failed += 1;
          this.logger.error(
            `Failed to enqueue notification outbox for user=${item.userId}: ${
              outboxError instanceof Error ? outboxError.message : String(outboxError)
            }`,
          );
        }
      }
      return { sent: 0, queued, failed };
    }
  }

  /**
   * Retry pending/failed outbox rows. Safe to call periodically.
   */
  async retryPending(limit = 50): Promise<{ processed: number; sent: number; failed: number }> {
    const rows = await this.prisma.notificationOutbox.findMany({
      where: { status: { in: ['PENDING', 'FAILED'] }, attempts: { lt: 8 } },
      orderBy: { createdAt: 'asc' },
      take: Math.min(Math.max(limit, 1), 200),
    });

    let sent = 0;
    let failed = 0;
    for (const row of rows) {
      try {
        await this.prisma.notification.create({
          data: {
            userId: row.userId,
            type: row.type,
            title: row.title,
            content: row.content,
            link: row.link,
          },
        });
        await this.prisma.notificationOutbox.update({
          where: { id: row.id },
          data: {
            status: 'SENT',
            sentAt: new Date(),
            attempts: row.attempts + 1,
            lastError: null,
          },
        });
        sent += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await this.prisma.notificationOutbox.update({
          where: { id: row.id },
          data: {
            status: 'FAILED',
            attempts: row.attempts + 1,
            lastError: message.slice(0, 1000),
          },
        });
        failed += 1;
      }
    }

    return { processed: rows.length, sent, failed };
  }

  async getStats() {
    const [pending, failed, sent] = await Promise.all([
      this.prisma.notificationOutbox.count({ where: { status: 'PENDING' } }),
      this.prisma.notificationOutbox.count({ where: { status: 'FAILED' } }),
      this.prisma.notificationOutbox.count({ where: { status: 'SENT' } }),
    ]);
    return { pending, failed, sent };
  }
}
