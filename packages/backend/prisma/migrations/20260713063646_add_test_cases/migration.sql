-- CreateTable
CREATE TABLE "ProblemTestCase" (
    "id" TEXT NOT NULL,
    "problemVersionId" TEXT NOT NULL,
    "input" TEXT NOT NULL DEFAULT '',
    "expectedOutput" TEXT NOT NULL DEFAULT '',
    "score" INTEGER NOT NULL DEFAULT 10,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isSample" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProblemTestCase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProblemTestCase_problemVersionId_idx" ON "ProblemTestCase"("problemVersionId");

-- CreateIndex
CREATE INDEX "ProblemTestCase_problemVersionId_order_idx" ON "ProblemTestCase"("problemVersionId", "order");

-- AddForeignKey
ALTER TABLE "ProblemTestCase" ADD CONSTRAINT "ProblemTestCase_problemVersionId_fkey" FOREIGN KEY ("problemVersionId") REFERENCES "ProblemVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
