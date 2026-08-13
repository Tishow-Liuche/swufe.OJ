import { Injectable } from '@nestjs/common';

type ContestStandingInput = {
  contest: any;
  participants: any[];
  problems: any[];
  submissions: any[];
  now: Date;
  canManage: boolean;
};

@Injectable()
export class ContestStandingsCalculatorService {
  calculate(input: ContestStandingInput) {
    const { contest, participants, problems, submissions, now, canManage } = input;
    const frozen = !!contest.freezeTime && now >= contest.freezeTime && now < contest.endTime && !canManage;
    const problemHeaders = problems.map((problem, index) => ({
      problemId: problem.problemId,
      order: problem.order,
      label: this.problemLabel(index),
      title: problem.problem?.title || `Problem ${this.problemLabel(index)}`,
      score: problem.score,
    }));
    const firstAcceptedByProblem = this.firstAcceptedByProblem(contest, participants, submissions, frozen);
    const rows = participants.map((participant) => {
      const start = this.participantStart(contest, participant);
      const end = this.participantEnd(contest, participant);
      const cutoff = frozen && !participant.isVirtual ? contest.freezeTime : end;
      const participantSubmissions = submissions
        .filter((submission) => (
          submission.userId === participant.userId
          && submission.createdAt >= start
          && submission.createdAt <= cutoff
        ))
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      const problemCells = this.problemCells(
        problems,
        participantSubmissions,
        firstAcceptedByProblem,
        now,
        end,
        canManage,
      );
      if (contest.mode === 'IOI') {
        const score = problemCells.reduce((sum, cell) => sum + cell.score, 0);
        return this.row(participant, problemCells, score, 0, participantSubmissions);
      }
      const solved = problemCells.filter((cell) => cell.accepted);
      const penalty = solved.reduce((sum, cell) => {
        const minutes = Math.floor((cell.acceptedAt.getTime() - start.getTime()) / 60_000);
        return sum + minutes + cell.wrongAttempts * contest.penaltyTime;
      }, 0);
      return this.row(participant, problemCells, 0, penalty, participantSubmissions);
    });

    rows.sort((a, b) => contest.mode === 'IOI'
      ? b.score - a.score || this.lastActiveTime(a) - this.lastActiveTime(b)
      : b.solvedCount - a.solvedCount || a.penalty - b.penalty || this.lastActiveTime(a) - this.lastActiveTime(b));

    let previous: any;
    return {
      contest: { id: contest.id, title: contest.title, mode: contest.mode, frozen },
      problems: problemHeaders,
      rows: rows.map((row, index) => {
        const tied = previous && (contest.mode === 'IOI'
          ? previous.score === row.score && this.lastActiveTime(previous) === this.lastActiveTime(row)
          : previous.solvedCount === row.solvedCount && previous.penalty === row.penalty);
        const rank = tied ? previous.rank : index + 1;
        previous = { ...row, rank };
        return { rank, ...row };
      }),
    };
  }

  private firstAcceptedByProblem(contest: any, participants: any[], submissions: any[], frozen: boolean) {
    const firstAccepted = new Map<string, { submissionId: string; userId: string; acceptedAt: Date }>();
    for (const participant of participants) {
      const start = this.participantStart(contest, participant);
      const end = this.participantEnd(contest, participant);
      const cutoff = frozen && !participant.isVirtual ? contest.freezeTime : end;
      const acceptedSubmissions = submissions
        .filter((submission) => (
          submission.userId === participant.userId
          && submission.status === 'ACCEPTED'
          && submission.createdAt >= start
          && submission.createdAt <= cutoff
        ))
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      for (const submission of acceptedSubmissions) {
        const current = firstAccepted.get(submission.problemId);
        if (!current || submission.createdAt < current.acceptedAt) {
          firstAccepted.set(submission.problemId, {
            submissionId: submission.id,
            userId: submission.userId,
            acceptedAt: submission.createdAt,
          });
        }
      }
    }
    return firstAccepted;
  }

  private problemCells(
    problems: any[],
    submissions: any[],
    firstAcceptedByProblem: Map<string, { submissionId: string; userId: string; acceptedAt: Date }>,
    now: Date,
    participantEnd: Date,
    canManage: boolean,
  ) {
    return problems.map((problem, index) => {
      const attempts = submissions.filter((submission) => submission.problemId === problem.problemId);
      const accepted = attempts.find((submission) => submission.status === 'ACCEPTED');
      const wrongAttempts = accepted
        ? attempts.filter((submission) => submission.createdAt < accepted.createdAt && submission.status !== 'ACCEPTED').length
        : attempts.filter((submission) => !this.runningStatuses.has(submission.status)).length;
      const bestScore = attempts.reduce((best, submission) => Math.max(best, submission.score || 0), 0);
      const label = this.problemLabel(index);
      return {
        problemId: problem.problemId,
        label,
        title: problem.problem?.title || `Problem ${label}`,
        status: this.cellStatus(attempts, accepted),
        accepted: !!accepted,
        viewableSubmissionId: now > participantEnd || canManage ? accepted?.id || null : null,
        attempts: attempts.length,
        wrongAttempts,
        score: bestScore,
        acceptedAt: accepted?.createdAt || null,
        firstBlood: !!accepted && firstAcceptedByProblem.get(problem.problemId)?.submissionId === accepted.id,
      };
    });
  }

  private row(participant: any, problems: any[], score: number, penalty: number, submissions: any[]) {
    return {
      user: participant.user,
      userId: participant.userId,
      isVirtual: participant.isVirtual,
      solvedCount: problems.filter((problem) => problem.accepted).length,
      score,
      penalty,
      lastActive: submissions.length ? submissions[submissions.length - 1].createdAt : null,
      problems,
    };
  }

  private participantStart(contest: any, participant: any) {
    return participant.isVirtual && participant.virtualStart ? participant.virtualStart : contest.startTime;
  }

  private participantEnd(contest: any, participant: any) {
    return participant.isVirtual && participant.virtualEnd ? participant.virtualEnd : contest.endTime;
  }

  private problemLabel(index: number) {
    let current = index;
    let label = '';
    do {
      label = String.fromCharCode(65 + (current % 26)) + label;
      current = Math.floor(current / 26) - 1;
    } while (current >= 0);
    return label;
  }

  private cellStatus(attempts: any[], accepted?: any) {
    if (accepted) return 'ACCEPTED';
    if (!attempts.length) return 'UNTRIED';
    return attempts.some((submission) => !this.runningStatuses.has(submission.status))
      ? 'WRONG_ANSWER'
      : 'PENDING';
  }

  private lastActiveTime(row: any) {
    return row.lastActive?.getTime() || Infinity;
  }

  private readonly runningStatuses = new Set(['PENDING', 'QUEUING', 'JUDGING', 'SUBMITTING', 'COMPILING', 'RUNNING']);
}
