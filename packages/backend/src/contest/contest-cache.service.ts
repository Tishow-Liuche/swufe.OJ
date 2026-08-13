import { Injectable, Logger } from '@nestjs/common';

type RedisLike = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: 'EX', ttlSeconds: number): Promise<unknown>;
  del(...keys: string[]): Promise<unknown>;
};

@Injectable()
export class ContestCacheService {
  private readonly logger = new Logger(ContestCacheService.name);

  constructor(private readonly redis?: RedisLike | null) {}

  async getStandings(contestId: string) {
    if (!this.redis) return null;
    try {
      const raw = await this.redis.get(this.standingsKey(contestId));
      return raw ? JSON.parse(raw) : null;
    } catch (error: any) {
      this.logger.warn(`Contest standings cache read failed: ${error.message}`);
      return null;
    }
  }

  async setStandings(contestId: string, value: unknown, ttlSeconds: number) {
    if (!this.redis || ttlSeconds <= 0) return;
    try {
      await this.redis.set(this.standingsKey(contestId), JSON.stringify(value), 'EX', ttlSeconds);
    } catch (error: any) {
      this.logger.warn(`Contest standings cache write failed: ${error.message}`);
    }
  }

  async invalidateContest(contestId: string) {
    if (!this.redis) return;
    try {
      await this.redis.del(this.standingsKey(contestId), this.submissionsKey(contestId));
    } catch (error: any) {
      this.logger.warn(`Contest cache invalidation failed: ${error.message}`);
    }
  }

  standingsKey(contestId: string) {
    return `contest:${contestId}:standings:v1`;
  }

  submissionsKey(contestId: string) {
    return `contest:${contestId}:submissions:v1`;
  }
}
