-- Learning workspace, AtCoder read-only platform capabilities, and the
-- RemoteSubmissionTask columns required by the current main branch.

ALTER TABLE "ExternalPlatform"
    ADD COLUMN "allowAutoSubmit" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "circuitOpenedAt" TIMESTAMP(3),
    ADD COLUMN "killSwitchReason" TEXT,
    ADD COLUMN "readOnly" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "requireUserConfirmation" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "LearningPlan"
    ADD COLUMN "dailyTarget" INTEGER NOT NULL DEFAULT 3,
    ADD COLUMN "description" TEXT;

ALTER TABLE "ProblemListItem"
    ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "ProblemSource"
    ADD COLUMN "capabilityJson" JSONB,
    ADD COLUMN "lastErrorCode" TEXT,
    ADD COLUMN "metadataHash" TEXT,
    ADD COLUMN "remoteContestId" TEXT,
    ADD COLUMN "remoteProblemIndex" TEXT,
    ADD COLUMN "remoteTaskScreenName" TEXT;

ALTER TABLE "RemoteSubmissionTask"
    ADD COLUMN "helperStage" TEXT,
    ADD COLUMN "leaseExpiresAt" TIMESTAMP(3),
    ADD COLUMN "leaseNonce" TEXT;

CREATE TABLE "LearningPlanCheckIn" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LearningPlanCheckIn_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProblemNote" (
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

CREATE INDEX "LearningPlanCheckIn_planId_idx" ON "LearningPlanCheckIn"("planId");
CREATE UNIQUE INDEX "LearningPlanCheckIn_planId_date_key" ON "LearningPlanCheckIn"("planId", "date");
CREATE INDEX "ProblemNote_userId_nextReviewAt_idx" ON "ProblemNote"("userId", "nextReviewAt");
CREATE INDEX "ProblemNote_userId_problemId_idx" ON "ProblemNote"("userId", "problemId");
CREATE INDEX "LearningPlanItem_planId_dayIndex_idx" ON "LearningPlanItem"("planId", "dayIndex");
CREATE INDEX "ProblemListItem_listId_order_idx" ON "ProblemListItem"("listId", "order");
CREATE UNIQUE INDEX "ProblemListItem_listId_problemId_key" ON "ProblemListItem"("listId", "problemId");
CREATE UNIQUE INDEX "ProblemSource_platform_remoteProblemId_key" ON "ProblemSource"("platform", "remoteProblemId");
CREATE INDEX "RemoteSubmissionTask_remoteSubmissionId_idx" ON "RemoteSubmissionTask"("remoteSubmissionId");
CREATE INDEX "RemoteSubmissionTask_leaseExpiresAt_idx" ON "RemoteSubmissionTask"("leaseExpiresAt");

ALTER TABLE "ProblemListItem"
    ADD CONSTRAINT "ProblemListItem_problemId_fkey"
    FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LearningPlanItem"
    ADD CONSTRAINT "LearningPlanItem_problemId_fkey"
    FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LearningPlanCheckIn"
    ADD CONSTRAINT "LearningPlanCheckIn_planId_fkey"
    FOREIGN KEY ("planId") REFERENCES "LearningPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProblemNote"
    ADD CONSTRAINT "ProblemNote_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProblemNote"
    ADD CONSTRAINT "ProblemNote_problemId_fkey"
    FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
