/*
  Warnings:

  - You are about to drop the column `accessToken` on the `ExternalAccount` table. All the data in the column will be lost.
  - You are about to drop the column `expiresAt` on the `ExternalAccount` table. All the data in the column will be lost.
  - You are about to drop the column `refreshToken` on the `ExternalAccount` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "ExternalAccount" DROP COLUMN "accessToken",
DROP COLUMN "expiresAt",
DROP COLUMN "refreshToken",
ADD COLUMN     "helperConnected" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastFailureAt" TIMESTAMP(3),
ADD COLUMN     "lastFailureReason" TEXT,
ADD COLUMN     "lastSuccessfulSubmissionAt" TIMESTAMP(3),
ADD COLUMN     "ownershipVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "remoteLoginVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'IDENTITY_ONLY';

-- CreateTable
CREATE TABLE "ExternalPlatform" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "supportsMetadata" BOOLEAN NOT NULL DEFAULT false,
    "supportsStatement" BOOLEAN NOT NULL DEFAULT false,
    "supportsBrowserSubmission" BOOLEAN NOT NULL DEFAULT false,
    "supportsOfficialSubmissionApi" BOOLEAN NOT NULL DEFAULT false,
    "supportsOfficialResultApi" BOOLEAN NOT NULL DEFAULT false,
    "allowLiveContestSubmission" BOOLEAN NOT NULL DEFAULT false,
    "adapterVersion" TEXT NOT NULL DEFAULT '0.0.0',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalPlatform_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HelperDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceName" TEXT NOT NULL,
    "browserName" TEXT NOT NULL,
    "extensionVersion" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'ONLINE',
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HelperDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RemoteSubmissionTask" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platformCode" TEXT NOT NULL,
    "externalAccountId" TEXT NOT NULL,
    "remoteProblemId" TEXT NOT NULL,
    "remoteContestId" TEXT,
    "remoteProblemIndex" TEXT,
    "language" TEXT NOT NULL,
    "sourceCode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "assignedHelperDeviceId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maximumAttempts" INTEGER NOT NULL DEFAULT 1,
    "remoteSubmissionId" TEXT,
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "nonce" TEXT,
    "signature" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RemoteSubmissionTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExternalPlatform_code_key" ON "ExternalPlatform"("code");

-- CreateIndex
CREATE INDEX "HelperDevice_userId_idx" ON "HelperDevice"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RemoteSubmissionTask_submissionId_key" ON "RemoteSubmissionTask"("submissionId");

-- CreateIndex
CREATE INDEX "RemoteSubmissionTask_userId_idx" ON "RemoteSubmissionTask"("userId");

-- CreateIndex
CREATE INDEX "RemoteSubmissionTask_status_idx" ON "RemoteSubmissionTask"("status");

-- CreateIndex
CREATE INDEX "RemoteSubmissionTask_assignedHelperDeviceId_idx" ON "RemoteSubmissionTask"("assignedHelperDeviceId");

-- AddForeignKey
ALTER TABLE "HelperDevice" ADD CONSTRAINT "HelperDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemoteSubmissionTask" ADD CONSTRAINT "RemoteSubmissionTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
