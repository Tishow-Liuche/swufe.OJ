# QOJ Problem Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add QOJ as an external problem source so the OJ can import QOJ problem lists and full statements like Luogu/Codeforces.

**Architecture:** Follow the existing SyncAdapter pattern. Add a focused QOJ adapter for HTTP fetching and HTML parsing, register it in SyncModule, expose QOJ in platform metadata and frontend filters, and keep remote submission out of scope for this phase.

**Tech Stack:** NestJS, Prisma, Jest, Vue 3, existing sync service.

---

### Task 1: QOJ adapter parser and HTTP adapter

**Files:**
- Create: `packages/backend/src/sync/adapters/qoj.adapter.ts`
- Test: `packages/backend/src/sync/adapters/qoj.adapter.spec.ts`

- [ ] Write failing tests for parsing a QOJ problem list page and a QOJ problem statement page.
- [ ] Run `npm test -- qoj.adapter.spec.ts --runInBand` and verify it fails because the adapter does not exist.
- [ ] Implement `QojAdapter` with `fetchList`, `fetchProblem`, `healthCheck`, and exported pure parsing helpers.
- [ ] Run the adapter test and verify it passes.

### Task 2: Register QOJ in backend platform/sync modules

**Files:**
- Modify: `packages/backend/src/sync/sync.module.ts`
- Modify: `packages/backend/src/helper/helper.service.ts`

- [ ] Register `new QojAdapter()` in `SyncModule` next to Luogu adapter.
- [ ] Seed helper platform `QOJ` with base URL `https://qoj.ac`, metadata support true, browser submission false.
- [ ] Run backend tests.

### Task 3: Frontend platform visibility

**Files:**
- Modify: `packages/frontend/src/views/ProblemList.vue`
- Modify: `packages/frontend/src/views/ProblemDetail.vue` if hard-coded wording says only Codeforces/Luogu.

- [ ] Add QOJ to source filter options.
- [ ] Ensure QOJ problems render through the existing external statement path.
- [ ] Run frontend build.

### Task 4: End-to-end verification

**Files:**
- No required new files.

- [ ] Run backend build.
- [ ] Run frontend build.
- [ ] Optionally run `syncProblem('QOJ','1')` against live QOJ if network is available.
- [ ] Commit and push only QOJ-related tracked changes; leave user documents/PDF untracked.
