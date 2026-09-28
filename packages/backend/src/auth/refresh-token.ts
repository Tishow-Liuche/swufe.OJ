import { createHash, createHmac } from 'crypto';

export const REFRESH_COOKIE = 'oj_refresh';
export const REFRESH_RECOVERY_WINDOW_MS = 5 * 60_000;

export function isValidRefreshAttempt(attempt: unknown): attempt is string {
  return typeof attempt === 'string' && /^[a-f0-9]{64}$/.test(attempt);
}

export function deriveRefreshSuccessor(refreshToken: string, attempt: string, secret: string): string {
  return createHmac('sha256', secret)
    .update('swufe:refresh-response-recovery:v1\0')
    .update(JSON.stringify([refreshToken, attempt]))
    .digest('hex');
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function refreshTokenMaxAge(expiresIn: string): number {
  const match = String(expiresIn).match(/^(\d+)([smhd])$/);
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const multiplier: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return Number(match[1]) * multiplier[match[2]];
}
