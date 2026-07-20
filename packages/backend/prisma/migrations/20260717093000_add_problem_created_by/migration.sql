-- Add nullable authorship to local problems.
ALTER TABLE "Problem" ADD COLUMN "createdBy" TEXT;

CREATE INDEX "Problem_createdBy_idx" ON "Problem"("createdBy");

ALTER TABLE "Problem"
  ADD CONSTRAINT "Problem_createdBy_fkey"
  FOREIGN KEY ("createdBy") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
