import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as https from 'https';
import { isDeepStrictEqual } from 'node:util';
import { mapCfRatingToPointDifficulty } from '../problem/point-difficulty';

interface CfApiSubmission {
  id: number;
  contestId?: number;
  creationTimeSeconds: number;
  problem: {
    contestId?: number;
    index?: string;
    name?: string;
    rating?: number;
  };
  verdict?: string;
  timeConsumedMillis?: number;
  memoryConsumedBytes?: number;
}

export interface CodeforcesAcceptedSyncSummary {
  handle: string;
  fetchedCount: number;
  acceptedCount: number;
  matchedCount: number;
  createdCount: number;
  updatedCount: number;
  unchangedCount: number;
  unmatchedCount: number;
}

const CF_STATUS_HOST = 'codeforces.com';
const CF_STATUS_PATH = '/api/user.status';
const DEFAULT_FETCH_COUNT = 1000;

@Injectable()
export class CfAcceptedSyncService {
  private readonly log = new Logger(CfAcceptedSyncService.name);

  constructor(private readonly prisma: PrismaService) {}

  async syncUserAccepted(userId: string, progress?: (data: any) => Promise<void>): Promise<CodeforcesAcceptedSyncSummary> {
    const account = await this.prisma.externalAccount.findFirst({
      where: { userId, platform: 'CODEFORCES' },
      select: { remoteUserId: true, remoteUsername: true },
    });
    const handle = (account?.remoteUsername || account?.remoteUserId || '').trim();
    if (!handle) {
      throw new BadRequestException('请先在个人中心绑定 Codeforces 账号');
    }

    const accepted = new Map<string, CfApiSubmission>();
    let fetchedCount = 0;
    let previousPage = '';
    for (let from = 1; ; from += DEFAULT_FETCH_COUNT) {
      if (from > 1) await new Promise(resolve => setTimeout(resolve, 2100));
      const submissions = await this.fetchUserStatus(handle, DEFAULT_FETCH_COUNT, from);
      const signature = submissions.map(s => s.id).join(',');
      if (submissions.length && signature === previousPage) throw new BadRequestException('Codeforces 返回重复分页，请稍后重试');
      previousPage = signature;
      fetchedCount += submissions.length;
      for (const [key, submission] of this.latestAcceptedByProblem(submissions)) {
        if (!accepted.has(key) || submission.id > accepted.get(key)!.id) accepted.set(key, submission);
      }
      await progress?.({ phase: 'fetching', fetchedCount, acceptedCount: accepted.size });
      if (submissions.length < DEFAULT_FETCH_COUNT) break;
    }
    const remoteIds = [...accepted.keys()];
    const sources = remoteIds.length
      ? await this.prisma.problemSource.findMany({
          where: {
            platform: 'CODEFORCES',
            remoteProblemId: { in: remoteIds },
          },
          select: { problemId: true, remoteProblemId: true, problem: { select: { status: true, difficulty: true } } },
        })
      : [];
    const sourceByRemoteId = new Map(sources.map((source) => [source.remoteProblemId, source]));
    // A rebinding during a long fetch must not import the old handle's records.
    const currentAccount = await this.prisma.externalAccount.findFirst({ where: { userId, platform: 'CODEFORCES' }, select: { remoteUsername: true, remoteUserId: true } });
    if ((currentAccount?.remoteUsername || currentAccount?.remoteUserId || '').trim() !== handle) {
      throw new BadRequestException('同步期间绑定账号已改变，请重新同步');
    }
    const existingRows = await this.prisma.externalSolvedProblem.findMany({ where: { userId, platform: 'CODEFORCES' } });
    const existingByRemote = new Map(existingRows.map(row => [row.remoteProblemId, row]));

    let createdCount = 0;
    let updatedCount = 0;
    let unchangedCount = 0;
    let matchedCount = 0;

    for (const [remoteProblemId, submission] of accepted) {
      const source = sourceByRemoteId.get(remoteProblemId);
      const existing = existingByRemote.get(remoteProblemId);
      if (source && (!source.problem || source.problem.status === 'PUBLISHED')) matchedCount++;

      // A real upstream rating may correct stale imported bands. Missing metadata
      // is not proof of being unrated; never erase a known or hidden difficulty here.
      const ratedDifficulty = mapCfRatingToPointDifficulty(submission.problem?.rating);
      if (ratedDifficulty && source?.problem?.status === 'PUBLISHED' && source.problem.difficulty !== ratedDifficulty) {
        await this.prisma.problem.updateMany({
          where: { id: source.problemId, status: 'PUBLISHED', difficulty: source.problem.difficulty },
          data: { difficulty: ratedDifficulty },
        });
      }

      const acceptedAt = new Date(submission.creationTimeSeconds * 1000);
      const remoteSubmissionId = String(submission.id);
      const timeUsed = normalizeOptionalNumber(submission.timeConsumedMillis);
      const memoryUsed = normalizeMemoryKb(submission.memoryConsumedBytes);
      const data = {
        problemId: source?.problemId ?? existing?.problemId ?? null,
        remoteSubmissionId,
        acceptedAt,
        timeUsed,
        memoryUsed,
        rawPayload: submission as any,
      };

      if (
        existing && existing.problemId === data.problemId &&
        existing.remoteSubmissionId === data.remoteSubmissionId &&
        Number(existing.timeUsed ?? -1) === Number(data.timeUsed ?? -1) &&
        Number(existing.memoryUsed ?? -1) === Number(data.memoryUsed ?? -1) &&
        isDeepStrictEqual((existing.rawPayload as any)?.problem, submission.problem)
      ) {
        unchangedCount++;
        continue;
      }

      await this.prisma.externalSolvedProblem.upsert({
        where: { userId_platform_remoteProblemId: { userId, platform: 'CODEFORCES', remoteProblemId } },
        create: { userId, platform: 'CODEFORCES', remoteProblemId, ...data },
        update: data,
      });
      if (existing) updatedCount++; else createdCount++;
      if ((createdCount + updatedCount) % 25 === 0) await progress?.({ phase: 'saving', fetchedCount, acceptedCount: accepted.size, savedCount: createdCount + updatedCount + unchangedCount });
    }

    const summary = {
      handle,
      fetchedCount,
      acceptedCount: accepted.size,
      matchedCount,
      createdCount,
      updatedCount,
      unchangedCount,
      unmatchedCount: accepted.size - matchedCount,
    };
    this.log.log(
      `CF accepted sync user=${userId} handle=${handle} fetched=${summary.fetchedCount} ` +
        `accepted=${summary.acceptedCount} matched=${summary.matchedCount} ` +
        `created=${summary.createdCount} updated=${summary.updatedCount}`,
    );
    return summary;
  }

  private latestAcceptedByProblem(submissions: CfApiSubmission[]) {
    const result = new Map<string, CfApiSubmission>();
    for (const submission of submissions) {
      if (submission.verdict !== 'OK') continue;
      const remoteProblemId = normalizeCfProblemId(submission);
      if (!remoteProblemId || (result.has(remoteProblemId) && result.get(remoteProblemId)!.id >= submission.id)) continue;
      result.set(remoteProblemId, submission);
    }
    return result;
  }

  private fetchUserStatus(handle: string, count: number, from = 1): Promise<CfApiSubmission[]> {
    const path =
      `${CF_STATUS_PATH}?handle=${encodeURIComponent(handle)}` +
      `&from=${from}&count=${Math.max(1, Math.min(count, 10000))}`;

    return new Promise((resolve, reject) => {
      const req = https.get(
        {
          hostname: CF_STATUS_HOST,
          path,
          headers: {
            'User-Agent': 'SWUFE-Singularity-OJ/1.0 Codeforces Accepted Sync',
            Accept: 'application/json',
          },
        },
        (res) => {
          let body = '';
          let bytes = 0;
          res.setEncoding('utf8');
          res.on('data', (chunk: string) => {
            bytes += Buffer.byteLength(chunk);
            if (bytes > 16 * 1024 * 1024) { req.destroy(new Error('Codeforces 分页响应超过安全上限')); return; }
            body += chunk;
          });
          res.on('error', () => reject(new BadRequestException('Codeforces 响应中断，请稍后重试')));
          res.on('aborted', () => reject(new BadRequestException('Codeforces 响应中断，请稍后重试')));
          res.on('end', () => {
            try {
              const payload = JSON.parse(body);
              if (payload.status !== 'OK' || !Array.isArray(payload.result)) {
                reject(new BadRequestException(payload.comment || 'Codeforces 返回异常，无法同步'));
                return;
              }
              resolve(payload.result as CfApiSubmission[]);
            } catch {
              reject(new BadRequestException('Codeforces 返回内容无法解析'));
            }
          });
        },
      );
      req.on('error', (err) => reject(new BadRequestException('Codeforces 同步请求失败：' + err.message)));
      req.setTimeout(12_000, () => {
        req.destroy();
        reject(new BadRequestException('Codeforces 同步超时，请稍后再试'));
      });
    });
  }
}

function normalizeCfProblemId(submission: CfApiSubmission) {
  const contestId = submission.problem?.contestId ?? submission.contestId;
  const index = submission.problem?.index;
  if (!contestId || !index) return '';
  return `${contestId}${String(index).toUpperCase()}`;
}

function normalizeOptionalNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeMemoryKb(bytes: unknown) {
  const n = Number(bytes);
  return Number.isFinite(n) ? Math.round(n / 1024) : null;
}
