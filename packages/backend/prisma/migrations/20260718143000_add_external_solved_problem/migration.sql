CREATE TABLE "ExternalSolvedProblem" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "problemId" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "remoteProblemId" TEXT NOT NULL,
  "remoteSubmissionId" TEXT,
  "acceptedAt" TIMESTAMP(3) NOT NULL,
  "timeUsed" INTEGER,
  "memoryUsed" INTEGER,
  "rawPayload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ExternalSolvedProblem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExternalSolvedProblem_userId_platform_remoteProblemId_key"
  ON "ExternalSolvedProblem"("userId", "platform", "remoteProblemId");

CREATE UNIQUE INDEX "ExternalSolvedProblem_platform_remoteSubmissionId_key"
  ON "ExternalSolvedProblem"("platform", "remoteSubmissionId");

CREATE INDEX "ExternalSolvedProblem_userId_idx"
  ON "ExternalSolvedProblem"("userId");

CREATE INDEX "ExternalSolvedProblem_problemId_idx"
  ON "ExternalSolvedProblem"("problemId");

CREATE INDEX "ExternalSolvedProblem_platform_remoteProblemId_idx"
  ON "ExternalSolvedProblem"("platform", "remoteProblemId");

ALTER TABLE "ExternalSolvedProblem"
  ADD CONSTRAINT "ExternalSolvedProblem_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExternalSolvedProblem"
  ADD CONSTRAINT "ExternalSolvedProblem_problemId_fkey"
  FOREIGN KEY ("problemId") REFERENCES "Problem"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
