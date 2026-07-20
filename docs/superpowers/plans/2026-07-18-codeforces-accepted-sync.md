# Codeforces Accepted Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a logged-in SWUFE OJ user sync accepted Codeforces problems from their bound Codeforces handle into the local OJ.

**Architecture:** Add a backend `ExternalSolvedProblem` table for imported remote AC records, a focused Codeforces sync service that fetches `user.status`, matches only problems already present in `ProblemSource`, and upserts idempotent solved records. Expose an authenticated API and add a personal-center button to trigger and display the sync summary.

**Tech Stack:** NestJS, Prisma, Jest, Vue 3, Axios.

---

### Task 1: Data model

**Files:**
- Modify: `packages/backend/prisma/schema.prisma`

- [ ] Add `ExternalSolvedProblem` linked to `User` and `Problem`.
- [ ] Add `externalSolvedProblems` relation fields on `User` and `Problem`.
- [ ] Ensure uniqueness by `(userId, platform, remoteProblemId)` and by `(platform, remoteSubmissionId)` when remote submission id exists.

### Task 2: Codeforces sync service

**Files:**
- Create: `packages/backend/src/codeforces/cf-accepted-sync.service.ts`
- Create: `packages/backend/src/codeforces/cf-accepted-sync.service.spec.ts`
- Modify: `packages/backend/src/codeforces/cf.module.ts`

- [ ] Write a failing test that imports accepted Codeforces submissions and ignores non-accepted submissions.
- [ ] Write a failing test that is idempotent when syncing the same submission twice.
- [ ] Implement fetch, normalize, match, and upsert logic.

### Task 3: Authenticated user API

**Files:**
- Modify: `packages/backend/src/user/user.service.ts`
- Modify: `packages/backend/src/user/user.controller.ts`
- Modify: `packages/backend/src/user/user.service.spec.ts`

- [ ] Add `POST /api/user/external-accounts/codeforces/sync`.
- [ ] Return a summary with handle, fetched count, accepted count, matched count, created count, updated count, and unmatched count.
- [ ] Require an existing bound Codeforces handle.

### Task 4: Profile UI entry

**Files:**
- Modify: `packages/frontend/src/views/Profile.vue`
- Modify: `packages/frontend/scripts/check-profile-ui.mjs`

- [ ] Add a Codeforces sync button in the remote account settings card.
- [ ] Show syncing state and the latest sync summary.
- [ ] Keep the existing settings layout stable.

### Task 5: Verification

**Commands:**
- `npm test -- cf-accepted-sync.service.spec.ts user.service.spec.ts --runInBand`
- `npm run build` in `packages/backend`
- `npm run test:profile-ui` in `packages/frontend`
- `npm run build` in `packages/frontend`
