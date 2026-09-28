import { DelayedError, Job } from 'bullmq';

const CONNECTION_ERRORS = new Set(['P1001', 'P1002', 'P1008', 'P1017', 'P2024']);
const SQL_CONNECTION_ERRORS = new Set(['08000', '08001', '08003', '08006', '08007', '08P01', '57P01', '57P02', '57P03', '53300']);
const RECOVERY_WINDOW_MS = 30 * 60_000;

export function isTransientDatabaseError(error: unknown): boolean {
  const value = error as { code?: string; errorCode?: string; name?: string; message?: string; meta?: { code?: string } } | null;
  return !!value && (CONNECTION_ERRORS.has(value.code || value.errorCode || '')
    || (value.code === 'P2010' && SQL_CONNECTION_ERRORS.has(value.meta?.code || ''))
    // Prisma's initial connection path can omit both code and errorCode.
    // Match only this known class/message, never generic application errors.
    || (value.name === 'PrismaClientInitializationError' && !value.code && !value.errorCode
      && /Can't reach database server at `[^`]+`/.test(value.message || '')));
}

/** A durable delay releases the worker slot and does not consume normal failure attempts. */
export function databaseRecoveryExpired(job: Job, now = Date.now()): boolean {
  const recovery = job.data.databaseRecovery as { since: number; expiredAt?: number } | undefined;
  return !!recovery && (recovery.expiredAt !== undefined || now - recovery.since >= RECOVERY_WINDOW_MS);
}

export async function deferDatabaseOutage(job: Job, token?: string, now = Date.now()): Promise<never> {
  const previous = job.data.databaseRecovery as { since: number; count: number; expiredAt?: number } | undefined;
  const since = previous?.since ?? now;
  const count = (previous?.count || 0) + 1;
  const expired = databaseRecoveryExpired(job, now);
  const delay = Math.min(60_000, 10_000 * 2 ** Math.min(count - 1, 3));
  await job.updateData({ ...job.data, databaseRecovery: { since, count,
    ...(expired ? { expiredAt: previous?.expiredAt ?? now } : {}) } });
  // If the DB is still down after the recovery window, retain an explicit marker
  // in Redis and retry only result publication. Never strand a RUNNING row.
  await job.moveToDelayed(expired ? now + 60_000 : Math.min(now + delay, since + RECOVERY_WINDOW_MS), token);
  throw new DelayedError();
}
