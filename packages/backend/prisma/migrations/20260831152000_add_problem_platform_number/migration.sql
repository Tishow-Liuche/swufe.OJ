ALTER TABLE "Problem" ADD COLUMN IF NOT EXISTS "problemNo" INTEGER;

CREATE SEQUENCE IF NOT EXISTS "Problem_problemNo_seq";
ALTER SEQUENCE "Problem_problemNo_seq" OWNED BY "Problem"."problemNo";

WITH numbered AS (
  SELECT
    id,
    ROW_NUMBER() OVER (ORDER BY "createdAt" ASC, id ASC) AS rn
  FROM "Problem"
)
UPDATE "Problem" AS p
SET "problemNo" = numbered.rn
FROM numbered
WHERE p.id = numbered.id
  AND p."problemNo" IS NULL;

SELECT setval(
  '"Problem_problemNo_seq"',
  GREATEST(COALESCE((SELECT MAX("problemNo") FROM "Problem"), 0), 1),
  COALESCE((SELECT MAX("problemNo") FROM "Problem"), 0) > 0
);

ALTER TABLE "Problem"
  ALTER COLUMN "problemNo" SET DEFAULT nextval('"Problem_problemNo_seq"'::regclass);

ALTER TABLE "Problem" ALTER COLUMN "problemNo" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Problem_problemNo_key" ON "Problem"("problemNo");
