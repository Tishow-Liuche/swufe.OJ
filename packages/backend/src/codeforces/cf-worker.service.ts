import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { CfVerdictMapper } from './cf-verdict.mapper';
import { CF_LANGUAGE_MAP } from './cf-submission.service';
import * as https from 'https';

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

type TaskRecord = Awaited<
  ReturnType<PrismaService['remoteSubmissionTask']['findFirst']>
> & {};

interface CfApiSubmission {
  id: number;
  contestId?: number;
  creationTimeSeconds: number;
  problem: { contestId?: number; index: string; name?: string };
  programmingLanguage: string;
  verdict?: string;
  testset?: string;
  passedTestCount: number;
  timeConsumedMillis: number;
  memoryConsumedBytes: number;
}

interface ParsedProblemId {
  contestId: number;
  index: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CF_BASE = 'codeforces.com';
const CF_API_STATUS = '/api/user.status';

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Background worker that continuously monitors CF remote-submission tasks.
 *
 * Lifecycle (OnModuleInit):
 *   1. Initial 3-second delay (let DI settle), then tick every N seconds.
 *   2. Each tick runs under a busy-guard so overlapping ticks are skipped.
 *
 * Tick phases:
 *   A. Fetch PENDING / PROCESSING CF tasks from the DB.
 *   B. [Optional] Attempt server-side submit for never-attempted tasks.
 *   C. Fetch recent submissions from the public CF API.
 *   D. Match CF submissions to open tasks:
 *      - Exact SID lookup (when remoteSubmissionId is known — from reportSid).
 *      - Problem + time-window match (fallback, tentative — never finalizes).
 *   E. Persist results back to Submission, SubmissionCase, RemoteJudgeJob.
 *   F. Expire stale tasks past their TTL.
 *
 * Key invariant (Bug 1 fix):
 *   A problem+time match WITHOUT a confirmed SID (remoteSubmissionId) is
 *   tentative — the matched CF submission might belong to a different user
 *   solving the same problem. Such a match is persisted but the task stays
 *   PROCESSING, never COMPLETED. Once reportSid writes the real
 *   remoteSubmissionId, a subsequent tick performs an exact SID lookup and
 *   finalizes the task with the correct verdict.
 */
@Injectable()
export class CfWorkerService implements OnModuleInit {
  private readonly log = new Logger(CfWorkerService.name);
  private busy = false;

  // ---- Configuration ------------------------------------------------------

  private readonly handle: string;
  private readonly password: string;
  private readonly pollIntervalMs: number;
  private readonly fetchCount: number;
  private readonly serverSubmitEnabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly verdict: CfVerdictMapper,
  ) {
    this.handle = this.config.get('CF_HANDLE', 'Tishow__Liuche');
    this.password = this.config.get('CF_PASSWORD', '');
    this.pollIntervalMs = this.config.get<number>('CF_POLL_INTERVAL_MS', 10_000);
    this.fetchCount = this.config.get<number>('CF_FETCH_COUNT', 30);
    this.serverSubmitEnabled = this.config.get<boolean>('CF_SERVER_SUBMIT_ENABLED', false);
  }

  // ---- Lifecycle ----------------------------------------------------------

  onModuleInit(): void {
    this.log.log(
      `Worker initialised  handle=${this.handle}  poll=${this.pollIntervalMs}ms  fetch=${this.fetchCount}`,
    );

    setTimeout(() => {
      this.tick();
      setInterval(() => this.tick(), this.pollIntervalMs);
    }, 3_000);
  }

  // ---- Main loop ----------------------------------------------------------

  private async tick(): Promise<void> {
    if (this.busy) {
      this.log.debug('Previous tick still running — skipping');
      return;
    }

    this.busy = true;

    try {
      // A. Fetch open tasks
      const tasks = await this.fetchOpenTasks();
      if (tasks.length === 0) {
        return;
      }

      this.log.debug(`Tick: ${tasks.length} open task(s)`);

      // B. Best-effort server-side submit (disabled by default)
      if (this.serverSubmitEnabled && this.password) {
        for (const task of tasks) {
          if ((task.attemptCount ?? 0) === 0) {
            await this.tryServerSubmit(task);
          }
        }
      }

      // C. Fetch recent CF submissions
      const cfs = await this.fetchCfRecent();
      if (!cfs) {
        this.log.warn('CF API unavailable — will retry next tick');
        return;
      }

      // D + E. Match and persist
      for (const task of tasks) {
        try {
          await this.matchAndUpdate(task, cfs);
        } catch (err: any) {
          this.log.warn(`Task ${task.id} processing error: ${err.message}`);
        }
      }

      // F. Expire stale tasks
      await this.expireStale();
    } catch (err: any) {
      this.log.error(`Tick error: ${err.message}`);
    } finally {
      this.busy = false;
    }
  }

  // =========================================================================
  // Database helpers
  // =========================================================================

  private async fetchOpenTasks() {
    return this.prisma.remoteSubmissionTask.findMany({
      where: {
        platformCode: 'CODEFORCES',
        status: { in: ['PENDING', 'PROCESSING'] },
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });
  }

  private async incrementTaskAttempt(taskId: string): Promise<void> {
    await this.prisma.remoteSubmissionTask
      .update({
        where: { id: taskId },
        data: { attemptCount: { increment: 1 } },
      })
      .catch(() => {});
  }

  private async incrementQueryCount(submissionId: string): Promise<void> {
    await this.prisma.remoteJudgeJob
      .update({
        where: { submissionId },
        data: { queryCount: { increment: 1 }, lastQueryAt: new Date() },
      })
      .catch(() => {});
  }

  /**
   * Expire tasks past their TTL.
   *
   * Bug fix: also updates the corresponding Submission record to REMOTE_ERROR
   * so the frontend sees a terminal status instead of being stuck on QUEUING.
   */
  private async expireStale(): Promise<void> {
    const now = new Date();

    // Fetch expiring tasks so we can update their Submission records too
    const stale = await this.prisma.remoteSubmissionTask.findMany({
      where: {
        platformCode: 'CODEFORCES',
        status: { in: ['PENDING', 'PROCESSING'] },
        expiresAt: { lte: now },
      },
      select: { id: true, submissionId: true },
    });

    if (stale.length === 0) return;

    this.log.log(`Expiring ${stale.length} stale CF task(s)`);

    // Update tasks to FAILED
    await this.prisma.remoteSubmissionTask.updateMany({
      where: {
        id: { in: stale.map((t) => t.id) },
      },
      data: {
        status: 'FAILED',
        failureCode: 'EXPIRED',
        failureMessage: 'Task TTL exceeded — no CF submission detected in time',
      },
    });

    // Update submissions — previously these stayed QUEUING forever
    const submissionIds = stale.map((t) => t.submissionId);
    await this.prisma.submission.updateMany({
      where: { id: { in: submissionIds } },
      data: { status: 'REMOTE_ERROR' },
    });

    // Mark judge jobs as finished
    await this.prisma.remoteJudgeJob.updateMany({
      where: { submissionId: { in: submissionIds } },
      data: { finishedAt: now, rawStatus: 'EXPIRED' },
    });
  }

  /**
   * Fail a task because it exceeded its maxQueries budget.
   * Previously queryCount was incremented but never checked against maxQueries,
   * causing tasks to silently waste worker cycles until the 30-min TTL.
   */
  private async failTaskExceededQueries(
    submissionId: string,
    maxQueries: number,
  ): Promise<void> {
    this.log.warn(
      `Task ${submissionId} exceeded maxQueries (${maxQueries}) — failing`,
    );

    await this.prisma.remoteSubmissionTask.updateMany({
      where: { submissionId, platformCode: 'CODEFORCES' },
      data: {
        status: 'FAILED',
        failureCode: 'MAX_QUERIES_EXCEEDED',
        failureMessage: `Exceeded ${maxQueries} CF API queries without matching a submission`,
      },
    });

    await this.prisma.submission.update({
      where: { id: submissionId },
      data: { status: 'REMOTE_ERROR' },
    });

    await this.prisma.remoteJudgeJob.update({
      where: { submissionId },
      data: { finishedAt: new Date(), rawStatus: 'MAX_QUERIES_EXCEEDED' },
    });
  }

  // =========================================================================
  // CF API — fetch recent submissions (public endpoint, no auth needed)
  // =========================================================================

  private fetchCfRecent(): Promise<CfApiSubmission[] | null> {
    const url =
      `https://${CF_BASE}${CF_API_STATUS}?handle=` +
      encodeURIComponent(this.handle) +
      `&from=1&count=${this.fetchCount}`;

    return new Promise((resolve) => {
      https
        .get(
          url,
          { headers: { 'User-Agent': 'SWUFE-OJ/3.0 (Node.js https)' } },
          (res) => {
            let data = '';
            res.on('data', (chunk: string) => (data += chunk));
            res.on('end', () => {
              try {
                const json = JSON.parse(data);
                if (json.status === 'OK' && Array.isArray(json.result)) {
                  resolve(json.result as CfApiSubmission[]);
                } else {
                  this.log.warn(
                    `CF API returned status="${json.status}" comment="${json.comment ?? ''}"`,
                  );
                  resolve(null);
                }
              } catch {
                this.log.warn('CF API response parse error');
                resolve(null);
              }
            });
          },
        )
        .on('error', (err: Error) => {
          this.log.warn(`CF API request error: ${err.message}`);
          resolve(null);
        });
    });
  }

  // =========================================================================
  // Matching
  // =========================================================================

  /**
   * Try to find a CF API submission that matches the given task.
   *
   * Two strategies, in priority order:
   *
   * 1. **Exact SID lookup** — when `task.remoteSubmissionId` is set (usually
   *    by the `reportSid` endpoint after the TM script detects the user's CF
   *    submission). This is authoritative — the SID is known to be correct.
   *    A terminal verdict here permanently finalizes the task (COMPLETED).
   *
   * 2. **Problem + time-window match** — fallback used when we don't yet have
   *    a confirmed SID. Matches by (contestId, problemIndex) against
   *    submissions created after task creation. This is TENTATIVE — the
   *    matched CF submission may belong to a different user solving the same
   *    problem. Results are persisted but the task stays PROCESSING so a
   *    later SID confirmation can override with the correct verdict.
   *
   * Bug 1 fix: problem+time matches without confirmed SID no longer set
   * COMPLETED — they stay PROCESSING, enabling correction when the real SID
   * arrives via reportSid.
   *
   * Bug 2 fix: re-reads remoteSubmissionId from DB at the start to avoid
   * stale snapshot data (the snapshot was taken in fetchOpenTasks before
   * reportSid may have written the SID for this tick).
   *
   * Bug 5 fix: checks queryCount against maxQueries and fails the task
   * if the budget is exhausted.
   *
   * Bug 7 fix: adds an upper time bound (task.createdAt + 5 min) to the
   * problem+time window, preventing matches against unrelated later
   * submissions to the same problem.
   */
  private async matchAndUpdate(
    task: TaskRecord,
    cfs: CfApiSubmission[],
  ): Promise<void> {
    // ── Re-read remoteSubmissionId to avoid stale snapshot (Bug 2) ─────────
    // Between fetchOpenTasks() and now, reportSid may have written the SID.
    const fresh = await this.prisma.remoteSubmissionTask.findUnique({
      where: { id: task.id },
      select: { remoteSubmissionId: true, submissionId: true },
    });
    const confirmedSid = fresh?.remoteSubmissionId ?? task.remoteSubmissionId ?? null;

    // ── Check maxQueries (Bug 5) ───────────────────────────────────────────
    const job = await this.prisma.remoteJudgeJob.findUnique({
      where: { submissionId: task.submissionId },
      select: { maxQueries: true, queryCount: true },
    });
    const maxQueries = job?.maxQueries ?? 60;
    const currentQueries = job?.queryCount ?? 0;
    if (currentQueries >= maxQueries) {
      await this.failTaskExceededQueries(task.submissionId, maxQueries);
      return;
    }

    // ── Time window ────────────────────────────────────────────────────────
    const taskTs = new Date(task.createdAt).getTime() / 1000 - 120; // -2 min buffer
    const taskTsUpper = new Date(task.createdAt).getTime() / 1000 + 300; // +5 min upper bound (Bug 7)

    let match: CfApiSubmission | undefined;
    let isConfirmed: boolean;

    if (confirmedSid) {
      // Strategy 1: Exact SID lookup — authoritative
      match = cfs.find((s) => String(s.id) === confirmedSid);
      isConfirmed = true;
    } else {
      // Strategy 2: Problem + time-window match — tentative
      const parsed = parseProblemId(task.remoteProblemId);
      if (!parsed) {
        this.log.warn(`Cannot parse remoteProblemId "${task.remoteProblemId}"`);
        return;
      }

      // Find the best matching CF submission within the time window.
      // CF API returns newest first, so the first match is the most recent
      // submission for this problem within our window.
      const matches = cfs.filter((s) => {
        const probCid = s.problem?.contestId ?? s.contestId;
        const probIdx = s.problem?.index;
        const ct = s.creationTimeSeconds ?? 0;
        return (
          probCid === parsed.contestId &&
          probIdx === parsed.index &&
          ct >= taskTs &&
          ct <= taskTsUpper // Upper bound (Bug 7 fix)
        );
      });
      match = matches.length > 0 ? matches[0] : undefined;
      isConfirmed = false;
    }

    if (!match) {
      // No match yet — increment query count so we track polling budget
      await this.incrementQueryCount(task.submissionId);
      return;
    }

    // ── Idempotency guard ──────────────────────────────────────────────────
    const dup = await this.prisma.remoteSubmissionTask.findFirst({
      where: {
        platformCode: 'CODEFORCES',
        remoteSubmissionId: String(match.id),
        id: { not: task.id },
      },
      select: { id: true },
    });

    if (dup) {
      this.log.debug(
        `CF sub ${match.id} already matched to task ${dup.id} — skipping task ${task.id}`,
      );
      return;
    }

    // ── Map verdict ────────────────────────────────────────────────────────
    const remoteStatus = this.verdict.mapVerdict(match.verdict);
    const status = isConfirmed ? remoteStatus : 'JUDGING';
    const score = isConfirmed ? this.verdict.verdictScore(status) : 0;
    const timeUsed = isConfirmed ? (match.timeConsumedMillis ?? 0) : 0;
    const memoryUsed = isConfirmed && match.memoryConsumedBytes
      ? Math.round(match.memoryConsumedBytes / 1024)
      : 0;
    const isTerminal = isConfirmed && this.verdict.isTerminal(status);

    // Bug 1 fix: Only set COMPLETED when the SID is confirmed.
    // Tentative problem+time matches stay PROCESSING so a later SID
    // confirmation can override with the correct verdict.
    const taskStatus =
      isTerminal && isConfirmed ? 'COMPLETED' : 'PROCESSING';

    this.log.log(
      `CF matched  sub=${task.submissionId}  cfId=${match.id}  ` +
      `raw="${match.verdict ?? 'null'}"  →  ${status}  score=${score}  ` +
      `time=${timeUsed}ms  mem=${memoryUsed}KB  ` +
      `terminal=${isTerminal}  confirmed=${isConfirmed}  taskStatus=${taskStatus}`,
    );

    // 1. Submission record
    await this.prisma.submission.update({
      where: { id: task.submissionId },
      data: {
        status,
        score,
        timeUsed,
        memoryUsed,
        judgedAt: isTerminal && isConfirmed ? new Date() : undefined,
      },
    });

    // 2. SubmissionCase — CF returns one global verdict (not per-test-case)
    await this.prisma.submissionCase.deleteMany({
      where: { submissionId: task.submissionId, caseIndex: 1 },
    });
    await this.prisma.submissionCase.create({
      data: {
        submissionId: task.submissionId,
        caseIndex: 1,
        status,
        timeUsed,
        memoryUsed,
      },
    });

    // 3. RemoteJudgeJob
    await this.prisma.remoteJudgeJob.update({
      where: { submissionId: task.submissionId },
      data: {
        remoteSubmissionId: isConfirmed ? String(match.id) : undefined,
        rawStatus: match.verdict ?? null,
        finishedAt:
          isTerminal && isConfirmed ? new Date() : undefined,
      },
    });

    // 4. RemoteSubmissionTask
    await this.prisma.remoteSubmissionTask.update({
      where: { id: task.id },
      data: {
        status: taskStatus,
        remoteSubmissionId: isConfirmed ? String(match.id) : undefined,
      },
    });
  }

  // =========================================================================
  // Server-side submit (best-effort — Cloudflare typically blocks this)
  // =========================================================================

  private async tryServerSubmit(task: TaskRecord): Promise<void> {
    try {
      this.log.debug(`Server-submit attempt for task ${task.id} (${task.remoteProblemId})`);

      const parsed = parseProblemId(task.remoteProblemId);
      if (!parsed) {
        await this.incrementTaskAttempt(task.id);
        return;
      }

      const langEntry = CF_LANGUAGE_MAP[task.language];
      if (!langEntry) {
        this.log.warn(`No CF language mapping for "${task.language}"`);
        await this.incrementTaskAttempt(task.id);
        return;
      }

      // Phase 1: CSRF from homepage
      const csrf = await this.fetchCsrfToken();
      if (!csrf) {
        this.log.debug('Server-submit: CSRF fetch failed (Cloudflare or network)');
        await this.incrementTaskAttempt(task.id);
        return;
      }

      // Phase 2: Login
      const sessionCookie = await this.cfLogin(csrf);
      if (!sessionCookie) {
        this.log.debug('Server-submit: login failed');
        await this.incrementTaskAttempt(task.id);
        return;
      }

      // Phase 3: Submit code
      const success = await this.cfSubmit(
        parsed.contestId,
        parsed.index,
        langEntry.programTypeId,
        task.sourceCode,
        csrf,
        sessionCookie,
      );

      if (success) {
        this.log.log(`Server-submit SUCCESS for task ${task.id}`);
        await this.prisma.remoteSubmissionTask.update({
          where: { id: task.id },
          data: {
            status: 'PROCESSING',
            attemptCount: { increment: 1 },
          },
        });
      } else {
        this.log.debug('Server-submit: POST returned failure');
        await this.incrementTaskAttempt(task.id);
      }
    } catch (err: any) {
      this.log.debug(`Server-submit exception (expected): ${err.message}`);
      await this.incrementTaskAttempt(task.id);
    }
  }

  // ---- Low-level HTTPS helpers for server-side submit ---------------------

  private fetchCsrfToken(): Promise<string | null> {
    return new Promise((resolve) => {
      const req = https.get(
        `https://${CF_BASE}/`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) SWUFE-OJ/3.0',
            Accept: 'text/html,application/xhtml+xml',
            'Accept-Language': 'en-US,en;q=0.9',
          },
        },
        (res) => {
          let html = '';
          res.on('data', (chunk: string) => (html += chunk));
          res.on('end', () => {
            if (html.length < 200) {
              resolve(null);
              return;
            }
            const csrf =
              html.match(/data-csrf=['"]([^'"]+)['"]/)?.[1] ??
              html.match(/X-Csrf-Token["'\s]+content=["']([^"']+)["']/)?.[1] ??
              html.match(/csrf=['"]([^'"]+)['"]/)?.[1] ??
              html.match(/name="csrf_token"[^>]+value="([^"]+)"/)?.[1] ??
              null;
            resolve(csrf);
          });
        },
      );

      req.on('error', () => resolve(null));
      req.setTimeout(8_000, () => {
        req.destroy();
        resolve(null);
      });
    });
  }

  private cfLogin(csrf: string): Promise<string | null> {
    return new Promise((resolve) => {
      const payload = new URLSearchParams({
        csrf_token: csrf,
        action: 'enter',
        handleOrEmail: this.handle,
        password: this.password,
        remember: 'on',
      }).toString();

      const options: https.RequestOptions = {
        hostname: CF_BASE,
        path: '/enter',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(payload),
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) SWUFE-OJ/3.0',
          Accept: 'text/html,application/xhtml+xml',
          Origin: `https://${CF_BASE}`,
          Referer: `https://${CF_BASE}/enter`,
        },
      };

      const req = https.request(options, (res) => {
        const cookies = extractCookies(res.headers['set-cookie']);
        resolve(cookies || null);
      });

      req.on('error', () => resolve(null));
      req.setTimeout(10_000, () => {
        req.destroy();
        resolve(null);
      });
      req.write(payload);
      req.end();
    });
  }

  private cfSubmit(
    contestId: number,
    problemIndex: string,
    programTypeId: number,
    sourceCode: string,
    csrf: string,
    cookies: string,
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const payload = new URLSearchParams({
        csrf_token: csrf,
        action: 'submitSolutionFormSubmitted',
        submittedProblemIndex: problemIndex,
        programTypeId: String(programTypeId),
        source: sourceCode,
        sourceFile: '',
      }).toString();

      const options: https.RequestOptions = {
        hostname: CF_BASE,
        path: `/problemset/submit?csrf_token=${encodeURIComponent(csrf)}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(payload),
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) SWUFE-OJ/3.0',
          Accept: 'text/html,application/xhtml+xml',
          Cookie: cookies,
          Origin: `https://${CF_BASE}`,
          Referer: `https://${CF_BASE}/problemset/submit/${contestId}/${problemIndex}`,
        },
      };

      const req = https.request(options, (res) => {
        const code = res.statusCode ?? 0;
        resolve(code >= 200 && code < 400);
      });

      req.on('error', () => resolve(false));
      req.setTimeout(15_000, () => {
        req.destroy();
        resolve(false);
      });
      req.write(payload);
      req.end();
    });
  }
}

// ===========================================================================
// Utility functions (pure, no side effects)
// ===========================================================================

function parseProblemId(raw: string): ParsedProblemId | null {
  const m = raw.match(/^(\d+)([A-Z]\d*)$/i);
  if (!m) return null;
  return { contestId: parseInt(m[1], 10), index: m[2].toUpperCase() };
}

function extractCookies(raw: string | string[] | undefined): string {
  if (!raw) return '';
  const headers = Array.isArray(raw) ? raw : [raw];
  const pairs: string[] = [];
  for (const h of headers) {
    const m = h.match(/^([^=]+=[^;]+)/);
    if (m) pairs.push(m[1]);
  }
  return pairs.join('; ');
}
