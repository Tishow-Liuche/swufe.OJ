import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as https from 'https';

interface CfApiSubmission {
  id: number;
  contestId?: number;
  creationTimeSeconds: number;
  problem: {
    contestId?: number;
    index?: string;
    name?: string;
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

  async syncUserAccepted(userId: string): Promise<CodeforcesAcceptedSyncSummary> {
    const account = await this.prisma.externalAccount.findFirst({
      where: { userId, platform: 'CODEFORCES' },
      select: { remoteUserId: true, remoteUsername: true },
    });
    const handle = (account?.remoteUsername || account?.remoteUserId || '').trim();
    if (!handle) {
      throw new BadRequestException('请先在个人中心绑定 Codeforces 账号');
    }

    const submissions = await this.fetchUserStatus(handle, DEFAULT_FETCH_COUNT);
    const accepted = this.latestAcceptedByProblem(submissions);
    const remoteIds = [...accepted.keys()];
    const sources = remoteIds.length
      ? await this.prisma.problemSource.findMany({
          where: {
            platform: 'CODEFORCES',
            remoteProblemId: { in: remoteIds },
            problem: { status: 'PUBLISHED' },
          },
          select: { problemId: true, remoteProblemId: true },
        })
      : [];
    const sourceByRemoteId = new Map(sources.map((source) => [source.remoteProblemId, source]));

    let createdCount = 0;
    let updatedCount = 0;
    let unchangedCount = 0;
    let matchedCount = 0;

    for (const [remoteProblemId, submission] of accepted) {
      const source = sourceByRemoteId.get(remoteProblemId);
      if (!source) continue;
      matchedCount++;

      const acceptedAt = new Date(submission.creationTimeSeconds * 1000);
      const remoteSubmissionId = String(submission.id);
      const timeUsed = normalizeOptionalNumber(submission.timeConsumedMillis);
      const memoryUsed = normalizeMemoryKb(submission.memoryConsumedBytes);
      const data = {
        problemId: source.problemId,
        remoteSubmissionId,
        acceptedAt,
        timeUsed,
        memoryUsed,
        rawPayload: submission as any,
      };

      const existing = await this.prisma.externalSolvedProblem.findUnique({
        where: {
          userId_platform_remoteProblemId: {
            userId,
            platform: 'CODEFORCES',
            remoteProblemId,
          },
        },
      });

      if (!existing) {
        await this.prisma.externalSolvedProblem.create({
          data: {
            userId,
            platform: 'CODEFORCES',
            remoteProblemId,
            ...data,
          },
        });
        createdCount++;
        continue;
      }

      if (
        existing.problemId === data.problemId &&
        existing.remoteSubmissionId === data.remoteSubmissionId &&
        Number(existing.timeUsed ?? -1) === Number(data.timeUsed ?? -1) &&
        Number(existing.memoryUsed ?? -1) === Number(data.memoryUsed ?? -1)
      ) {
        unchangedCount++;
        continue;
      }

      await this.prisma.externalSolvedProblem.update({
        where: { id: existing.id },
        data,
      });
      updatedCount++;
    }

    const summary = {
      handle,
      fetchedCount: submissions.length,
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
      if (!remoteProblemId || result.has(remoteProblemId)) continue;
      result.set(remoteProblemId, submission);
    }
    return result;
  }

  private fetchUserStatus(handle: string, count: number): Promise<CfApiSubmission[]> {
    const path =
      `${CF_STATUS_PATH}?handle=${encodeURIComponent(handle)}` +
      `&from=1&count=${Math.max(1, Math.min(count, 10000))}`;

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
          res.on('data', (chunk: string) => (body += chunk));
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
