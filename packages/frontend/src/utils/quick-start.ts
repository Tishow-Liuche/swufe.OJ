export type QuickStartProblem = {
  id: string;
  sourceInfo?: {
    platform?: string | null;
    remoteProblemId?: string | null;
  } | null;
};

export function resolveQuickStartProblem(
  problems: QuickStartProblem[],
  remoteProblemId: string,
): QuickStartProblem | null {
  return problems.find((problem) => (
    problem.sourceInfo?.platform === 'LUOGU'
    && problem.sourceInfo?.remoteProblemId === remoteProblemId
  )) || null;
}
