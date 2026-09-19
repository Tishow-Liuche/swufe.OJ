CREATE INDEX "ProblemVersion_problemId_isCurrent_idx"
ON "ProblemVersion"("problemId", "isCurrent");

CREATE INDEX "Submission_userId_status_createdAt_idx"
ON "Submission"("userId", "status", "createdAt");

CREATE INDEX "Submission_problemId_createdAt_idx"
ON "Submission"("problemId", "createdAt");
