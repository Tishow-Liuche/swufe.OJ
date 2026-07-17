-- Historical problems intentionally keep a NULL owner and are therefore admin-only.
ALTER TABLE "Problem" ADD COLUMN "createdById" TEXT;

CREATE INDEX "Problem_createdById_idx" ON "Problem"("createdById");

ALTER TABLE "Problem"
  ADD CONSTRAINT "Problem_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Duplicate grants have the same authorization effect; keep one before enforcing uniqueness.
DELETE FROM "ProblemPermission" AS duplicate
USING "ProblemPermission" AS retained
WHERE duplicate.ctid < retained.ctid
  AND duplicate."problemId" = retained."problemId"
  AND duplicate."targetType" = retained."targetType"
  AND duplicate."targetId" = retained."targetId"
  AND duplicate."permission" = retained."permission";

CREATE UNIQUE INDEX "ProblemPermission_problemId_targetType_targetId_permission_key"
  ON "ProblemPermission"("problemId", "targetType", "targetId", "permission");
