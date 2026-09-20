export function hideContestHints(contestId: string, state?: string): boolean {
  return Boolean(contestId) && state !== 'ENDED';
}
