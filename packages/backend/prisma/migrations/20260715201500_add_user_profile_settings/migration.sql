ALTER TABLE "User" ADD COLUMN "phone" TEXT;

CREATE TABLE "CompetitionAward" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "competition" TEXT NOT NULL,
  "year" INTEGER,
  "season" TEXT,
  "region" TEXT,
  "awardLevel" TEXT NOT NULL,
  "teamName" TEXT,
  "rank" INTEGER,
  "certificateUrl" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CompetitionAward_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CompetitionAward_userId_idx" ON "CompetitionAward"("userId");
CREATE INDEX "CompetitionAward_competition_year_idx" ON "CompetitionAward"("competition", "year");

ALTER TABLE "CompetitionAward" ADD CONSTRAINT "CompetitionAward_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
