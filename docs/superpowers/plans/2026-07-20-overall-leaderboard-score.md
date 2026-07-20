# Overall Leaderboard Score Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing overall leaderboard show real SWUFE Point scores.

**Architecture:** The backend computes overall rows from accepted submissions on original local problems only (`Problem.source = LOCAL`). Contest score is returned as `0` for now and kept as a separate field so future contest scoring can plug in without changing the UI contract.

**Tech Stack:** NestJS, Prisma, Vue 3, TypeScript, Jest.

---

### Task 1: Backend overall score

**Files:**
- Modify: `packages/backend/src/contest/contest.service.ts`
- Modify: `packages/backend/src/contest/contest.service.spec.ts`
- Modify: `packages/backend/src/public/public.controller.ts`

- [ ] Write a Jest test proving P0/P1/P2/P3/P4/P5 local accepted problems score `1/4/10/20/40/66`, duplicate AC only counts once, non-local problems and external sync do not add score.
- [ ] Add `overallLeaderboard()` to `ContestService`.
- [ ] Add `GET /api/leaderboard/overall` in `PublicController`.
- [ ] Run `npm test -- contest.service.spec.ts --runInBand`.

### Task 2: Frontend overall board

**Files:**
- Modify: `packages/frontend/src/views/Leaderboard.vue`

- [ ] When scope is `OVERALL`, request `/api/leaderboard/overall`.
- [ ] Remove the placeholder card and render rows with columns rank, user, overall score, score composition.
- [ ] Run `npm run build`.

### Task 3: Commit

**Files:**
- Include only the files touched above and this plan.

- [ ] Commit on branch `42411036`.
- [ ] Push `42411036` to origin.
