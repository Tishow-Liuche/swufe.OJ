BEGIN;
ALTER TABLE "ExternalSolvedProblem" ALTER COLUMN "problemId" DROP NOT NULL;
ALTER TABLE "ExternalSolvedProblem" DROP CONSTRAINT "ExternalSolvedProblem_problemId_fkey";
ALTER TABLE "ExternalSolvedProblem" ADD CONSTRAINT "ExternalSolvedProblem_problemId_fkey"
  FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
DROP INDEX "ExternalSolvedProblem_platform_remoteSubmissionId_key";
CREATE UNIQUE INDEX "ExternalSolvedProblem_user_platform_submission_key"
  ON "ExternalSolvedProblem"("userId", "platform", "remoteSubmissionId");
COMMIT;
