-- Consolidate the remote authored-problem column into the security owner column.
-- Preserve existing authorship before removing the superseded relation.
UPDATE "Problem"
SET "createdById" = "createdBy"
WHERE "createdById" IS NULL
  AND "createdBy" IS NOT NULL;

ALTER TABLE "Problem" DROP CONSTRAINT IF EXISTS "Problem_createdBy_fkey";
DROP INDEX IF EXISTS "Problem_createdBy_idx";
ALTER TABLE "Problem" DROP COLUMN IF EXISTS "createdBy";
