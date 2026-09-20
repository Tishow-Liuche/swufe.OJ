import { mapCfRatingToPointDifficulty } from '../problem/point-difficulty';

/** A remote-only solve is not a synthetic row in the public problem bank. */
export function externalSolvedIdentity(row: { problemId?: string | null; platform: string; remoteProblemId: string }) {
  return row.problemId || `external:${row.platform}:${row.remoteProblemId}`;
}

export function externalProblemDisplay(row: { platform: string; remoteProblemId: string; rawPayload?: unknown }) {
  const payload = row.rawPayload as any;
  const rating = Number(payload?.problem?.rating);
  const difficulty = row.platform === 'CODEFORCES' && Number.isFinite(rating) && rating > 0 ? mapCfRatingToPointDifficulty(rating) : null;
  const title = typeof payload?.problem?.name === 'string' ? payload.problem.name.slice(0, 500) : `${row.platform} ${row.remoteProblemId}`;
  return { id: null, problemNo: null, title, difficulty, source: 'REMOTE', sourceInfo: { platform: row.platform, remoteProblemId: row.remoteProblemId } };
}
