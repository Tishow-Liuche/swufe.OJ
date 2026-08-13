CREATE INDEX IF NOT EXISTS "Submission_userId_problemId_status_createdAt_idx"
ON "Submission"("userId", "problemId", "status", "createdAt");

CREATE INDEX IF NOT EXISTS "Submission_problemId_status_createdAt_idx"
ON "Submission"("problemId", "status", "createdAt");

CREATE INDEX IF NOT EXISTS "ContestParticipant_contestId_userId_idx"
ON "ContestParticipant"("contestId", "userId");

CREATE INDEX IF NOT EXISTS "ContestSubmission_contestId_submissionId_idx"
ON "ContestSubmission"("contestId", "submissionId");
