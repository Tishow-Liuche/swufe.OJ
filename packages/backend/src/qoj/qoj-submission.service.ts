import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface QojSubmitResult {
  submissionId: string;
  status: string;
  mode: 'QOJ';
  qojSubmitUrl: string;
  message: string;
}

export const QOJ_LANGUAGE_LABELS: Record<string, string> = {
  cpp: 'C++',
  c: 'C',
  python: 'Python',
  java: 'Java',
};

@Injectable()
export class QojSubmissionService {
  private readonly log = new Logger(QojSubmissionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createTask(
    userId: string,
    problemId: string,
    language: string,
    sourceCode: string,
  ): Promise<QojSubmitResult> {
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
      throw new NotFoundException('Problem has no remote QOJ problem ID configured');
    }

    const problemVersion = problem.versions[0];
    if (!problemVersion) {
      throw new NotFoundException('Problem version not found');
    }

    if (!QOJ_LANGUAGE_LABELS[language]) {
      throw new NotFoundException(
        `Language "${language}" is not supported for QOJ submissions. ` +
          `Supported: ${Object.keys(QOJ_LANGUAGE_LABELS).join(', ')}`,
      );
    }

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

    const expiresAt = new Date(Date.now() + 30 * 60 * 1_000);
    await this.prisma.remoteSubmissionTask.create({
      data: {
        submissionId: submission.id,
        userId,
        platformCode: 'QOJ',
        externalAccountId: problem.sourceInfo?.id ?? '',
        remoteProblemId,
        language,
        sourceCode,
        status: 'PENDING',
        expiresAt,
        maximumAttempts: 1,
      },
    });

    await this.prisma.remoteJudgeJob.create({
      data: {
        submissionId: submission.id,
        platform: 'QOJ',
        remoteProblemId,
        maxQueries: 120,
      },
    });

    const qojSubmitUrl = `https://qoj.ac/problem/${encodeURIComponent(remoteProblemId)}`;
    this.log.log(
      `QOJ task created sub=${submission.id} pid=${remoteProblemId} lang=${language} user=${userId}`,
    );

    return {
      submissionId: submission.id,
      status: 'QUEUING',
      mode: 'QOJ',
      qojSubmitUrl,
      message: [
        `Open ${qojSubmitUrl}`,
        `Select language: ${QOJ_LANGUAGE_LABELS[language]}`,
        `The helper script will submit and report the result back to OJ.`,
      ].join('\n'),
    };
  }
}
