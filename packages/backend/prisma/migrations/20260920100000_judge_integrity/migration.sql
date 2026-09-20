ALTER TABLE "Checker" ADD COLUMN "protocol" TEXT NOT NULL DEFAULT 'LEGACY';
ALTER TABLE "ProblemVersion" ADD COLUMN "timeLimit" INTEGER;
ALTER TABLE "ProblemVersion" ADD COLUMN "memoryLimit" INTEGER;
-- Only the current version's limits are knowable. Never invent historical limits.
UPDATE "ProblemVersion" AS v SET "timeLimit" = p."timeLimit", "memoryLimit" = p."memoryLimit"
FROM "Problem" AS p WHERE v."problemId" = p."id" AND v."isCurrent" = true;
