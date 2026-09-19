import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  AcceptedSolve,
  AssignmentRules,
  AssignmentStudentStatus,
  computeStudentProgress,
  StudentProgressResult,
} from './assignment-progress';

type AssignmentWithProblems = {
  id: string;
  startTime: Date;
  endTime: Date;
  allowLate: boolean;
  latePenalty: number;
  passCondition: string | null;
  countExternalAc: boolean;
  problems: Array<{ problemId: string; score: number; order: number }>;
};

@Injectable()
export class AssignmentProgressService {
  private readonly logger = new Logger(AssignmentProgressService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Recompute and persist one student's AssignmentStudent row.
   * SETTLED rows are never overwritten by automatic recompute.
   */
  async recomputeStudent(
    assignmentId: string,
    userId: string,
    now: Date = new Date(),
  ): Promise<StudentProgressResult | null> {
    const assignment = await this.loadAssignment(assignmentId);
    if (!assignment) return null;

    const existing = await this.prisma.assignmentStudent.findUnique({
      where: { assignmentId_userId: { assignmentId, userId } },
    });
    if (existing?.status === 'SETTLED') {
      return null;
    }

    const progress = await this.calculate(assignment, userId, now);
    await this.prisma.assignmentStudent.upsert({
      where: { assignmentId_userId: { assignmentId, userId } },
      create: {
        assignmentId,
        userId,
        status: progress.status,
        score: progress.score,
        submittedAt: progress.submittedAt,
        completedAt: progress.completedAt,
      },
      update: {
        status: progress.status,
        score: progress.score,
        submittedAt: progress.submittedAt,
        completedAt: progress.completedAt,
      },
    });
    return progress;
  }

  /**
   * Recompute every enrolled student for an assignment (report refresh / settle prep).
   */
  async recomputeAssignment(assignmentId: string, now: Date = new Date()) {
    const assignment = await this.loadAssignment(assignmentId);
    if (!assignment) return { updated: 0 };

    const students = await this.prisma.assignmentStudent.findMany({
      where: { assignmentId },
      select: { userId: true, status: true },
    });

    let updated = 0;
    for (const student of students) {
      if (student.status === 'SETTLED') continue;
      const progress = await this.calculate(assignment, student.userId, now);
      await this.prisma.assignmentStudent.update({
        where: { assignmentId_userId: { assignmentId, userId: student.userId } },
        data: {
          status: progress.status,
          score: progress.score,
          submittedAt: progress.submittedAt,
          completedAt: progress.completedAt,
        },
      });
      updated += 1;
    }
    return { updated };
  }

  /**
   * After a local submission becomes ACCEPTED, refresh all open assignments that include the problem.
   * Safe no-op when the user is not enrolled in any related assignment.
   */
  async onLocalAccepted(userId: string, problemId: string, acceptedAt: Date = new Date()) {
    try {
      const links = await this.prisma.assignmentProblem.findMany({
        where: { problemId },
        select: {
          assignmentId: true,
          assignment: {
            select: {
              id: true,
              startTime: true,
              endTime: true,
              allowLate: true,
            },
          },
        },
      });
      if (!links.length) return { refreshed: 0 };

      let refreshed = 0;
      for (const link of links) {
        const enrollment = await this.prisma.assignmentStudent.findUnique({
          where: {
            assignmentId_userId: { assignmentId: link.assignmentId, userId },
          },
          select: { status: true },
        });
        if (!enrollment || enrollment.status === 'SETTLED') continue;

        // Skip clearly closed windows when late is disabled and AC is after end.
        const a = link.assignment;
        if (!a.allowLate && acceptedAt > a.endTime) {
          // Still recompute so EXPIRED is authoritative if partial progress existed.
        }
        if (acceptedAt < a.startTime) continue;

        await this.recomputeStudent(link.assignmentId, userId, new Date());
        refreshed += 1;
      }
      return { refreshed };
    } catch (error) {
      this.logger.warn(
        `Failed to refresh assignment progress for user=${userId} problem=${problemId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return { refreshed: 0 };
    }
  }

  /**
   * Lock current scores as SETTLED for all enrolled students.
   */
  async settleAssignment(assignmentId: string) {
    await this.recomputeAssignment(assignmentId);
    const result = await this.prisma.assignmentStudent.updateMany({
      where: { assignmentId, status: { not: 'SETTLED' } },
      data: { status: 'SETTLED' },
    });
    return { settled: result.count };
  }

  async calculate(
    assignment: AssignmentWithProblems,
    userId: string,
    now: Date = new Date(),
  ): Promise<StudentProgressResult> {
    const rules: AssignmentRules = {
      startTime: assignment.startTime,
      endTime: assignment.endTime,
      allowLate: assignment.allowLate,
      latePenalty: assignment.latePenalty,
      passCondition: assignment.passCondition,
      countExternalAc: assignment.countExternalAc,
    };

    const problemIds = assignment.problems.map((item) => item.problemId);
    if (!problemIds.length) {
      return computeStudentProgress([], [], rules, now);
    }

    const solves = await this.collectSolves(userId, problemIds, rules);
    return computeStudentProgress(
      assignment.problems.map((item) => ({
        problemId: item.problemId,
        score: item.score,
        order: item.order,
      })),
      solves,
      rules,
      now,
    );
  }

  async collectSolves(
    userId: string,
    problemIds: string[],
    rules: AssignmentRules,
  ): Promise<AcceptedSolve[]> {
    const upperBound = rules.allowLate ? undefined : rules.endTime;
    const local = await this.prisma.submission.findMany({
      where: {
        userId,
        problemId: { in: problemIds },
        status: 'ACCEPTED',
        createdAt: {
          gte: rules.startTime,
          ...(upperBound ? { lte: upperBound } : {}),
        },
      },
      select: { problemId: true, createdAt: true, judgedAt: true },
      orderBy: { createdAt: 'asc' },
    });

    const solves: AcceptedSolve[] = local.map((item) => ({
      problemId: item.problemId,
      acceptedAt: item.judgedAt || item.createdAt,
      source: 'LOCAL',
    }));

    if (rules.countExternalAc) {
      const external = await this.prisma.externalSolvedProblem.findMany({
        where: {
          userId,
          problemId: { in: problemIds },
          acceptedAt: {
            gte: rules.startTime,
            ...(upperBound ? { lte: upperBound } : {}),
          },
        },
        select: { problemId: true, acceptedAt: true },
      });
      for (const item of external) {
        if (!item.problemId || !item.acceptedAt) continue;
        solves.push({
          problemId: item.problemId,
          acceptedAt: item.acceptedAt,
          source: 'EXTERNAL',
        });
      }
    }

    return solves;
  }

  private async loadAssignment(assignmentId: string): Promise<AssignmentWithProblems | null> {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      select: {
        id: true,
        startTime: true,
        endTime: true,
        allowLate: true,
        latePenalty: true,
        passCondition: true,
        countExternalAc: true,
        problems: {
          orderBy: { order: 'asc' },
          select: { problemId: true, score: true, order: true },
        },
      },
    });
    return assignment;
  }
}

export type { AssignmentStudentStatus };
