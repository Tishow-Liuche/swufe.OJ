import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { CfVerdictMapper } from './cf-verdict.mapper';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface CfSubmitResult {
  /** OJ-internal submission ID (UUID). */
  submissionId: string;
  /** Current OJ status string. */
  status: string;
  /** Dispatch mode — always 'CODEFORCES' for this service. */
  mode: string;
  /** The CF problemset submit page the user should open. */
  cfSubmitUrl: string;
  /** Human-readable instructions for manual submission. */
  message: string;
}

export interface CfLanguageEntry {
  /** CF programTypeId expected by the /problemset/submit POST form. */
  programTypeId: number;
  /** Human-readable name shown to the user (e.g. "GNU G++17"). */
  displayName: string;
}

// ---------------------------------------------------------------------------
// Language mapping (OJ code → CF program type ID)
//
// These IDs are stable on Codeforces but may change when CF updates its
// judge farm.  For a production system consider storing them in
// SystemConfig or reading from environment variables, e.g.:
//   CF_LANG_CPP=54  CF_LANG_C=43  CF_LANG_PYTHON=31  CF_LANG_JAVA=60
// ---------------------------------------------------------------------------

export const CF_LANGUAGE_MAP: Record<string, CfLanguageEntry> = {
  cpp:    { programTypeId: 54, displayName: 'GNU G++17' },
  c:      { programTypeId: 43, displayName: 'GNU GCC C11' },
  python: { programTypeId: 31, displayName: 'Python 3' },
  java:   { programTypeId: 60, displayName: 'Java 11' },
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class CfSubmissionService {
  private readonly log = new Logger(CfSubmissionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly verdict: CfVerdictMapper,
  ) {}

  // ---- Public API ---------------------------------------------------------

  /**
   * Create a CF remote-judge submission.
   *
   * Process:
   * 1. Validate the problem exists, is published, and links to a valid CF
   *    remoteProblemId (e.g. "4A" → contest 4, index A).
   * 2. Persist a `Submission` record (status = QUEUING).
   * 3. Persist a `RemoteSubmissionTask` record (status = PENDING) that the
   *    background worker will pick up.
   * 4. Persist a `RemoteJudgeJob` for query-tracking state.
   * 5. Return the CF submit URL + manual-submission instructions.
   *
   * The caller (submission.service.ts) returns this payload to the frontend
   * so the user knows where to paste their code.
   */
  async createTask(
    userId: string,
    problemId: string,
    language: string,
    sourceCode: string,
  ): Promise<CfSubmitResult> {
    // 1. Load problem + remote identity
    const problem = await this.prisma.problem.findUnique({
      where: { id: problemId },
      include: {
        sourceInfo: true,
        versions: { where: { isCurrent: true } },
      },
    });

    if (!problem || problem.status !== 'PUBLISHED') {
      throw new NotFoundException('Problem not found or not published');
    }

    const remoteProblemId = problem.sourceInfo?.remoteProblemId;
    if (!remoteProblemId) {
      throw new NotFoundException('Problem has no remote CF problem ID configured');
    }

    const parsed = this.parseProblemId(remoteProblemId);
    if (!parsed) {
      throw new NotFoundException(
        `Invalid CF problem ID format: "${remoteProblemId}". Expected e.g. "4A" or "1800C2".`,
      );
    }

    const problemVersion = problem.versions[0];
    if (!problemVersion) {
      throw new NotFoundException('Problem version not found');
    }

    const langEntry = CF_LANGUAGE_MAP[language];
    if (!langEntry) {
      throw new NotFoundException(
        `Language "${language}" is not supported for CF submissions. ` +
        `Supported: ${Object.keys(CF_LANGUAGE_MAP).join(', ')}`,
      );
    }

    // 2. Create local submission
    const submission = await this.prisma.submission.create({
      data: {
        problemId,
        problemVersionId: problemVersion.id,
        userId,
        language,
        sourceCode,
        status: 'QUEUING',
      },
    });

    // 3. Remote task — the worker's work queue
    const expiresAt = new Date(Date.now() + 30 * 60 * 1_000); // 30 min TTL
    await this.prisma.remoteSubmissionTask.create({
      data: {
        submissionId: submission.id,
        userId,
        platformCode: 'CODEFORCES',
        externalAccountId: problem.sourceInfo?.id ?? '',
        remoteProblemId,
        remoteContestId: String(parsed.contestId),
        remoteProblemIndex: parsed.index,
        language,
        sourceCode,
        status: 'PENDING',
        expiresAt,
        maximumAttempts: 1,
      },
    });

    // 4. Judge job tracker (worker updates this as it polls)
    await this.prisma.remoteJudgeJob.create({
      data: {
        submissionId: submission.id,
        platform: 'CODEFORCES',
        remoteProblemId,
        maxQueries: 60,
      },
    });

    // 5. Build response
    const cfSubmitUrl =
      `https://codeforces.com/problemset/submit/${parsed.contestId}/${parsed.index}`;

    const message = [
      `Open ${cfSubmitUrl}`,
      `Select language: ${langEntry.displayName}`,
      `Paste your code and submit.`,
      `The system will detect your submission within ~10 seconds.`,
    ].join('\n');

    this.log.log(
      `CF task created  sub=${submission.id}  cf=${remoteProblemId}  lang=${language}  user=${userId}`,
    );

    return {
      submissionId: submission.id,
      status: 'QUEUING',
      mode: 'CODEFORCES',
      cfSubmitUrl,
      message,
    };
  }

  /**
   * Retrieve the resolved state of a CF-triggered submission.
   * Used by polling clients (GET /submissions/:id) to read the asynchronous
   * result the worker wrote back.
   */
  async getResult(submissionId: string) {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        problem: { select: { id: true, title: true, timeLimit: true, memoryLimit: true } },
        user: { select: { id: true, username: true } },
        remoteJob: true,
        cases: { orderBy: { caseIndex: 'asc' } },
      },
    });

    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    return submission;
  }

  /**
   * Get the CF language entry for an OJ language code.
   * Returns `undefined` when the language is not supported.
   */
  getLanguageEntry(language: string): CfLanguageEntry | undefined {
    return CF_LANGUAGE_MAP[language];
  }

  // ---- Helpers ------------------------------------------------------------

  /**
   * Parse a CF-style remote problem ID into contest number + problem index.
   *
   * Examples:
   *   "4A"       → { contestId: 4,   index: "A" }
   *   "1800C2"   → { contestId: 1800, index: "C2" }
   *   "2000F1"   → { contestId: 2000, index: "F1" }
   */
  parseProblemId(raw: string): { contestId: number; index: string } | null {
    const m = raw.match(/^(\d+)([A-Z]\d*)$/i);
    if (!m) return null;
    return { contestId: parseInt(m[1], 10), index: m[2].toUpperCase() };
  }
}
