/**
 * Assignment student progress: pure rules for status, score and completion.
 *
 * Status machine:
 * - NOT_STARTED  before startTime, or no accepted progress yet while open
 * - IN_PROGRESS  open window (or late window) with partial progress
 * - COMPLETED    pass condition met before endTime
 * - LATE         pass condition met after endTime (allowLate)
 * - EXPIRED      past endTime, incomplete, and late not allowed (or late window closed)
 * - SETTLED      teacher-locked final record (never auto-downgraded by recompute)
 */

export type AssignmentStudentStatus =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'LATE'
  | 'EXPIRED'
  | 'SETTLED';

export type PassCondition =
  | { type: 'ALL' }
  | { type: 'COUNT'; count: number }
  | { type: 'PERCENT'; percent: number };

export interface AssignmentProblemSpec {
  problemId: string;
  score: number;
  order?: number;
}

export interface AcceptedSolve {
  problemId: string;
  /** When the AC occurred (local judgedAt/createdAt or external acceptedAt). */
  acceptedAt: Date;
  source: 'LOCAL' | 'EXTERNAL';
}

export interface AssignmentRules {
  startTime: Date;
  endTime: Date;
  allowLate: boolean;
  /** 0–100, percent deducted from each late-accepted problem score. */
  latePenalty: number;
  passCondition?: string | null;
  countExternalAc?: boolean;
}

export interface ProblemProgress {
  problemId: string;
  solved: boolean;
  acceptedAt: Date | null;
  late: boolean;
  earnedScore: number;
  maxScore: number;
  source: 'LOCAL' | 'EXTERNAL' | null;
}

export interface StudentProgressResult {
  status: AssignmentStudentStatus;
  solvedCount: number;
  totalProblems: number;
  requiredCount: number;
  completed: boolean;
  late: boolean;
  score: number;
  maxScore: number;
  submittedAt: Date | null;
  completedAt: Date | null;
  problems: ProblemProgress[];
}

export function parsePassCondition(raw?: string | null): PassCondition {
  const value = String(raw || '').trim().toUpperCase();
  if (!value || value === 'ALL') return { type: 'ALL' };

  const countMatch = value.match(/^COUNT\s*[:=]\s*(\d+)$/i) || value.match(/^AT_LEAST\s*[:=]\s*(\d+)$/i);
  if (countMatch) {
    return { type: 'COUNT', count: Math.max(0, Number(countMatch[1])) };
  }

  const percentMatch = value.match(/^PERCENT\s*[:=]\s*(\d+(?:\.\d+)?)$/i) || value.match(/^(\d+(?:\.\d+)?)%$/);
  if (percentMatch) {
    return { type: 'PERCENT', percent: Math.min(100, Math.max(0, Number(percentMatch[1]))) };
  }

  // Bare number treated as absolute solve count.
  if (/^\d+$/.test(value)) {
    return { type: 'COUNT', count: Number(value) };
  }

  return { type: 'ALL' };
}

export function requiredSolveCount(totalProblems: number, passCondition?: string | null): number {
  if (totalProblems <= 0) return 0;
  const rule = parsePassCondition(passCondition);
  if (rule.type === 'COUNT') return Math.min(totalProblems, rule.count);
  if (rule.type === 'PERCENT') return Math.min(totalProblems, Math.ceil((totalProblems * rule.percent) / 100));
  return totalProblems;
}

function clampPenalty(latePenalty: number): number {
  if (!Number.isFinite(latePenalty)) return 0;
  return Math.min(100, Math.max(0, latePenalty));
}

function pickBestSolve(
  problemId: string,
  solves: AcceptedSolve[],
  rules: AssignmentRules,
): AcceptedSolve | null {
  const candidates = solves
    .filter((solve) => solve.problemId === problemId)
    .filter((solve) => rules.countExternalAc || solve.source === 'LOCAL')
    .filter((solve) => {
      // Accept only after start. Before start never counts.
      if (solve.acceptedAt < rules.startTime) return false;
      // Within window always ok; after end only when late allowed.
      if (solve.acceptedAt <= rules.endTime) return true;
      return rules.allowLate;
    })
    .sort((a, b) => a.acceptedAt.getTime() - b.acceptedAt.getTime());

  return candidates[0] || null;
}

/**
 * Compute authoritative progress for one student on one assignment.
 * Pure function — no I/O.
 */
export function computeStudentProgress(
  problems: AssignmentProblemSpec[],
  solves: AcceptedSolve[],
  rules: AssignmentRules,
  now: Date = new Date(),
): StudentProgressResult {
  const ordered = [...problems].sort((a, b) => (a.order || 0) - (b.order || 0));
  const penalty = clampPenalty(rules.latePenalty);
  const problemProgress: ProblemProgress[] = ordered.map((item) => {
    const maxScore = Math.max(0, item.score || 0);
    const best = pickBestSolve(item.problemId, solves, rules);
    if (!best) {
      return {
        problemId: item.problemId,
        solved: false,
        acceptedAt: null,
        late: false,
        earnedScore: 0,
        maxScore,
        source: null,
      };
    }
    const late = best.acceptedAt > rules.endTime;
    const earnedScore = late
      ? Math.round(maxScore * (1 - penalty / 100))
      : maxScore;
    return {
      problemId: item.problemId,
      solved: true,
      acceptedAt: best.acceptedAt,
      late,
      earnedScore,
      maxScore,
      source: best.source,
    };
  });

  const solved = problemProgress.filter((item) => item.solved);
  const solvedCount = solved.length;
  const totalProblems = ordered.length;
  const requiredCount = requiredSolveCount(totalProblems, rules.passCondition);
  const completed = totalProblems > 0 && solvedCount >= requiredCount && requiredCount > 0;
  // Completion moment: when the N-th required solve happened (by AC time order).
  const acceptedTimes = solved
    .map((item) => item.acceptedAt!)
    .sort((a, b) => a.getTime() - b.getTime());
  const completedAt = completed ? acceptedTimes[requiredCount - 1] || acceptedTimes[acceptedTimes.length - 1] : null;
  const late = Boolean(completedAt && completedAt > rules.endTime);
  const score = problemProgress.reduce((sum, item) => sum + item.earnedScore, 0);
  const maxScore = problemProgress.reduce((sum, item) => sum + item.maxScore, 0);
  const submittedAt = acceptedTimes[0] || null;

  let status: AssignmentStudentStatus;
  if (completed) {
    status = late ? 'LATE' : 'COMPLETED';
  } else if (now < rules.startTime) {
    status = 'NOT_STARTED';
  } else if (now <= rules.endTime) {
    status = solvedCount > 0 ? 'IN_PROGRESS' : 'NOT_STARTED';
  } else if (rules.allowLate) {
    status = solvedCount > 0 ? 'IN_PROGRESS' : 'NOT_STARTED';
  } else {
    status = 'EXPIRED';
  }

  return {
    status,
    solvedCount,
    totalProblems,
    requiredCount,
    completed,
    late,
    score,
    maxScore,
    submittedAt,
    completedAt,
    problems: problemProgress,
  };
}

export function assignmentLifecycleLabel(
  startTime: Date,
  endTime: Date,
  now: Date = new Date(),
  allowLate = false,
): 'NOT_STARTED' | 'IN_PROGRESS' | 'CLOSED' | 'LATE_OPEN' {
  if (now < startTime) return 'NOT_STARTED';
  if (now <= endTime) return 'IN_PROGRESS';
  if (allowLate) return 'LATE_OPEN';
  return 'CLOSED';
}

export function statusLabelZh(status: AssignmentStudentStatus | string): string {
  switch (status) {
    case 'NOT_STARTED':
      return '未开始';
    case 'IN_PROGRESS':
      return '进行中';
    case 'COMPLETED':
      return '已完成';
    case 'LATE':
      return '已补交';
    case 'EXPIRED':
      return '已截止';
    case 'SETTLED':
      return '已结算';
    default:
      return status;
  }
}

/** Build CSV for teacher assignment report. */
export function buildAssignmentReportCsv(input: {
  assignmentTitle: string;
  students: Array<{
    username: string;
    nickname?: string | null;
    status: string;
    solvedCount: number;
    totalProblems: number;
    score: number;
    completedAt?: Date | string | null;
    problems: Array<{ problemId: string; title: string; status: string; attempts: number }>;
  }>;
  problems: Array<{ id: string; title: string }>;
}): string {
  const escape = (value: unknown) => {
    const text = value == null ? '' : String(value);
    if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  };

  const headers = [
    '用户名',
    '昵称',
    '状态',
    '已解',
    '总题',
    '得分',
    '完成时间',
    ...input.problems.map((problem) => problem.title),
  ];

  const lines = [headers.map(escape).join(',')];
  for (const student of input.students) {
    const byProblem = new Map(student.problems.map((item) => [item.problemId, item]));
    lines.push([
      student.username,
      student.nickname || '',
      statusLabelZh(student.status),
      student.solvedCount,
      student.totalProblems,
      student.score,
      student.completedAt
        ? new Date(student.completedAt).toISOString()
        : '',
      ...input.problems.map((problem) => {
        const cell = byProblem.get(problem.id);
        if (!cell) return '未提交';
        return `${cell.status}${cell.attempts ? `(${cell.attempts})` : ''}`;
      }),
    ].map(escape).join(','));
  }
  return `﻿${lines.join('\n')}`;
}

export function filterReportStudents<T extends {
  status: string;
  completed: boolean;
  user: { username: string; nickname?: string | null };
}>(
  students: T[],
  filters: { status?: string; keyword?: string; completion?: 'all' | 'completed' | 'incomplete' } = {},
): T[] {
  const keyword = String(filters.keyword || '').trim().toLowerCase();
  const status = String(filters.status || '').trim().toUpperCase();
  const completion = filters.completion || 'all';

  return students.filter((student) => {
    if (status && student.status !== status) return false;
    if (completion === 'completed' && !student.completed) return false;
    if (completion === 'incomplete' && student.completed) return false;
    if (keyword) {
      const haystack = `${student.user.username} ${student.user.nickname || ''}`.toLowerCase();
      if (!haystack.includes(keyword)) return false;
    }
    return true;
  });
}
