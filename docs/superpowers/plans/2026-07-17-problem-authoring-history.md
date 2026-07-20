# Problem Authoring History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a historical authoring module that lets teachers/admins repair previously entered local problems, including test data and SPJ configuration.

**Architecture:** Store creator ownership on `Problem`, add backend endpoints for owned historical listing and complete local updates, then add frontend history/edit pages that reuse the existing authoring form. ZIP test data remains replaced through the existing upload endpoint with stronger ownership checks.

**Tech Stack:** NestJS, Prisma/PostgreSQL, Jest, Vue 3, Vue Router, Vite.

---

### Task 1: Add ownership to local problems

**Files:**
- Modify: `packages/backend/prisma/schema.prisma`
- Modify: `packages/backend/src/problem/problem.service.spec.ts`
- Modify: `packages/backend/src/problem/problem.service.ts`

- [ ] Add `Problem.createdBy` and `User.authoredProblems`.
- [ ] Write a failing Jest test that `createFull(dto, userId)` writes `createdBy: userId`.
- [ ] Implement the minimal service change.
- [ ] Run `npm test -- problem.service.spec.ts --runInBand`.

### Task 2: Add historical authored-problem listing

**Files:**
- Modify: `packages/backend/src/problem/problem.controller.ts`
- Modify: `packages/backend/src/problem/problem.service.spec.ts`
- Modify: `packages/backend/src/problem/problem.service.ts`
- Modify: `packages/backend/src/problem/dto.ts`

- [ ] Add a query DTO for authored history.
- [ ] Write failing tests for teacher-owned filtering and admin all-local filtering.
- [ ] Add `GET /api/problems/mine/created`.
- [ ] Return current version summary, checker, tags, `_count.testCases`, `_count.submissions`.
- [ ] Run `npm test -- problem.service.spec.ts --runInBand`.

### Task 3: Strengthen local problem editing

**Files:**
- Modify: `packages/backend/src/problem/problem.controller.ts`
- Modify: `packages/backend/src/problem/problem.service.spec.ts`
- Modify: `packages/backend/src/problem/problem.service.ts`
- Modify: `packages/backend/src/problem/dto.ts`

- [ ] Write failing tests for full update of base fields, version fields, tags, checker, and ownership rejection.
- [ ] Change controller update to pass `req.user`.
- [ ] Implement `assertCanManageLocalProblem`.
- [ ] Implement full current-version update instead of partial base update.
- [ ] Run `npm test -- problem.service.spec.ts --runInBand`.

### Task 4: Apply ownership checks to test data and status changes

**Files:**
- Modify: `packages/backend/src/problem/problem.controller.ts`
- Modify: `packages/backend/src/problem/problem.service.spec.ts`
- Modify: `packages/backend/src/problem/problem.service.ts`

- [ ] Write failing tests proving a teacher cannot upload test data or publish another user’s local problem.
- [ ] Pass `req.user` to upload/status endpoints.
- [ ] Call ownership checks before modifying local problems.
- [ ] Run `npm test -- problem.service.spec.ts --runInBand`.

### Task 5: Build frontend history and edit flow

**Files:**
- Modify: `packages/frontend/src/router/index.ts`
- Modify: `packages/frontend/src/App.vue`
- Modify: `packages/frontend/src/views/admin/CreateProblem.vue`
- Create: `packages/frontend/src/views/admin/ProblemHistory.vue`

- [ ] Add routes for history and edit.
- [ ] Add a “历史录题” nav entry.
- [ ] Add `ProblemHistory.vue` to list/search authored local problems and navigate to edit.
- [ ] Extend `CreateProblem.vue` to load/edit an existing problem when `route.params.id` exists.
- [ ] In edit mode, ZIP upload is optional and replaces old test data only when a file is selected.
- [ ] Run `npm run build`.

### Task 6: Database migration and end-to-end verification

**Files:**
- Create migration under `packages/backend/prisma/migrations/`
- Modify generated Prisma client via `npx prisma generate`

- [ ] Create migration adding nullable `Problem.createdBy`.
- [ ] Run Prisma generate.
- [ ] Run backend tests.
- [ ] Run backend build.
- [ ] Run frontend build.
- [ ] Restart backend.
- [ ] Smoke test API and pages.
