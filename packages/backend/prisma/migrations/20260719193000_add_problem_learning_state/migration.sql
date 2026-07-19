CREATE TABLE "ProblemDraft" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "sourceCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProblemDraft_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DailyPracticeItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "order" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'UNSOLVED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DailyPracticeItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProblemDraft_userId_problemId_key" ON "ProblemDraft"("userId", "problemId");
CREATE INDEX "ProblemDraft_userId_updatedAt_idx" ON "ProblemDraft"("userId", "updatedAt");
CREATE UNIQUE INDEX "DailyPracticeItem_userId_date_order_key" ON "DailyPracticeItem"("userId", "date", "order");
CREATE UNIQUE INDEX "DailyPracticeItem_userId_date_problemId_key" ON "DailyPracticeItem"("userId", "date", "problemId");
CREATE INDEX "DailyPracticeItem_userId_date_idx" ON "DailyPracticeItem"("userId", "date");

ALTER TABLE "ProblemDraft"
    ADD CONSTRAINT "ProblemDraft_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProblemDraft"
    ADD CONSTRAINT "ProblemDraft_problemId_fkey"
    FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DailyPracticeItem"
    ADD CONSTRAINT "DailyPracticeItem_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DailyPracticeItem"
    ADD CONSTRAINT "DailyPracticeItem_problemId_fkey"
    FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
