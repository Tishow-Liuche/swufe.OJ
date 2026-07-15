ALTER TABLE "RemoteSubmissionTask" ADD COLUMN "leaseNonce" TEXT;
ALTER TABLE "RemoteSubmissionTask" ADD COLUMN "leaseExpiresAt" TIMESTAMP(3);
ALTER TABLE "RemoteSubmissionTask" ADD COLUMN "helperStage" TEXT;

CREATE INDEX "RemoteSubmissionTask_remoteSubmissionId_idx" ON "RemoteSubmissionTask"("remoteSubmissionId");
CREATE INDEX "RemoteSubmissionTask_leaseExpiresAt_idx" ON "RemoteSubmissionTask"("leaseExpiresAt");
