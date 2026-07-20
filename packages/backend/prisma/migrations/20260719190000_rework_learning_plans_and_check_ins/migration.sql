-- Learning plans now represent a user's progress through a problem list.
-- The previous date/target model cannot identify a source list, so its rows
-- are removed before the incompatible columns are replaced.
DELETE FROM "LearningPlan";

DROP TABLE IF EXISTS "LearningPlanCheckIn";
DROP TABLE IF EXISTS "LearningPlanItem";

ALTER TABLE "LearningPlan"
    DROP COLUMN "name",
    DROP COLUMN "description",
    DROP COLUMN "type",
    DROP COLUMN "startDate",
    DROP COLUMN "endDate",
    DROP COLUMN "dailyTarget",
    ADD COLUMN "problemListId" TEXT NOT NULL,
    ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    ADD COLUMN "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN "completedAt" TIMESTAMP(3);

CREATE TABLE "UserCheckIn" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserCheckIn_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LearningPlan_userId_problemListId_key" ON "LearningPlan"("userId", "problemListId");
CREATE INDEX "LearningPlan_userId_status_idx" ON "LearningPlan"("userId", "status");
CREATE INDEX "LearningPlan_problemListId_idx" ON "LearningPlan"("problemListId");
CREATE UNIQUE INDEX "UserCheckIn_userId_date_key" ON "UserCheckIn"("userId", "date");
CREATE INDEX "UserCheckIn_userId_idx" ON "UserCheckIn"("userId");

ALTER TABLE "LearningPlan"
    ADD CONSTRAINT "LearningPlan_problemListId_fkey"
    FOREIGN KEY ("problemListId") REFERENCES "ProblemList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserCheckIn"
    ADD CONSTRAINT "UserCheckIn_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
