-- Learning workspace, AtCoder read-only platform capabilities, and the
-- RemoteSubmissionTask columns required by the current main branch.
-- Idempotent to support existing dev databases that already received part of
-- these columns via earlier migrations or manual schema sync.

ALTER TABLE "ExternalPlatform"
    ADD COLUMN IF NOT EXISTS "allowAutoSubmit" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "circuitOpenedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "killSwitchReason" TEXT,
    ADD COLUMN IF NOT EXISTS "readOnly" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS "requireUserConfirmation" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "LearningPlan"
    ADD COLUMN IF NOT EXISTS "dailyTarget" INTEGER NOT NULL DEFAULT 3,
    ADD COLUMN IF NOT EXISTS "description" TEXT;

ALTER TABLE "ProblemListItem"
    ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "ProblemSource"
    ADD COLUMN IF NOT EXISTS "capabilityJson" JSONB,
    ADD COLUMN IF NOT EXISTS "lastErrorCode" TEXT,
    ADD COLUMN IF NOT EXISTS "metadataHash" TEXT,
    ADD COLUMN IF NOT EXISTS "remoteContestId" TEXT,
    ADD COLUMN IF NOT EXISTS "remoteProblemIndex" TEXT,
    ADD COLUMN IF NOT EXISTS "remoteTaskScreenName" TEXT;

ALTER TABLE "RemoteSubmissionTask"
    ADD COLUMN IF NOT EXISTS "helperStage" TEXT,
    ADD COLUMN IF NOT EXISTS "leaseExpiresAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "leaseNonce" TEXT;

CREATE TABLE IF NOT EXISTS "LearningPlanCheckIn" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LearningPlanCheckIn_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ProblemNote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "reviewStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
    "nextReviewAt" TIMESTAMP(3),
    "lastReviewedAt" TIMESTAMP(3),
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProblemNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "LearningPlanCheckIn_planId_idx" ON "LearningPlanCheckIn"("planId");
CREATE UNIQUE INDEX IF NOT EXISTS "LearningPlanCheckIn_planId_date_key" ON "LearningPlanCheckIn"("planId", "date");
CREATE INDEX IF NOT EXISTS "ProblemNote_userId_nextReviewAt_idx" ON "ProblemNote"("userId", "nextReviewAt");
CREATE INDEX IF NOT EXISTS "ProblemNote_userId_problemId_idx" ON "ProblemNote"("userId", "problemId");
CREATE INDEX IF NOT EXISTS "LearningPlanItem_planId_dayIndex_idx" ON "LearningPlanItem"("planId", "dayIndex");
CREATE INDEX IF NOT EXISTS "ProblemListItem_listId_order_idx" ON "ProblemListItem"("listId", "order");
CREATE UNIQUE INDEX IF NOT EXISTS "ProblemListItem_listId_problemId_key" ON "ProblemListItem"("listId", "problemId");
CREATE UNIQUE INDEX IF NOT EXISTS "ProblemSource_platform_remoteProblemId_key" ON "ProblemSource"("platform", "remoteProblemId");
CREATE INDEX IF NOT EXISTS "RemoteSubmissionTask_remoteSubmissionId_idx" ON "RemoteSubmissionTask"("remoteSubmissionId");
CREATE INDEX IF NOT EXISTS "RemoteSubmissionTask_leaseExpiresAt_idx" ON "RemoteSubmissionTask"("leaseExpiresAt");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProblemListItem_problemId_fkey') THEN
        ALTER TABLE "ProblemListItem" ADD CONSTRAINT "ProblemListItem_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LearningPlanItem_problemId_fkey') THEN
        ALTER TABLE "LearningPlanItem" ADD CONSTRAINT "LearningPlanItem_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LearningPlanCheckIn_planId_fkey') THEN
        ALTER TABLE "LearningPlanCheckIn" ADD CONSTRAINT "LearningPlanCheckIn_planId_fkey" FOREIGN KEY ("planId") REFERENCES "LearningPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProblemNote_userId_fkey') THEN
        ALTER TABLE "ProblemNote" ADD CONSTRAINT "ProblemNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProblemNote_problemId_fkey') THEN
        ALTER TABLE "ProblemNote" ADD CONSTRAINT "ProblemNote_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
