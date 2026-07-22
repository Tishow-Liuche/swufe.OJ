# Student Assignments and Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give approved students a secure class-assignment workspace, notify students when a teacher publishes work, and require login for community content.

**Architecture:** Use the existing user module for student-scoped authorization and assignment reads, preserving teacher APIs as teacher-only. Extend the existing notification model at the successful end of assignment publication. Add a thin student view that links to the existing problem page, and enforce authentication both at the community route and backend read endpoints.

**Tech Stack:** NestJS, Prisma, Jest, Vue 3 Composition API, Vue Router, Vitest, Lucide Vue.

---

## File Structure

- Modify: `packages/frontend/src/router/index.ts` and `index.spec.ts` for community authentication and the student assignment route.
- Modify: `packages/backend/src/community/community.controller.ts` for JWT protection of community list endpoints.
- Modify: `packages/backend/src/user/user.controller.ts`, `user.service.ts`, and `user.service.spec.ts` for student assignment authorization, retrieval, and progress.
- Modify: `packages/backend/src/teacher/teacher.service.ts` and `teacher.service.spec.ts` for assignment notifications.
- Modify: `packages/frontend/src/views/StudentClasses.vue` and create `StudentClassAssignments.vue` for student navigation and assignment display.
- Modify: `src/App.vue` so community navigation uses the existing protected-navigation helper.

### Task 1: Protect Community Navigation and Reads

- [ ] Write a Vitest case that starts logged out, navigates to `/community`, and expects `/login` with `redirect=/community`.
- [ ] Run `npm test -- --run src/router/index.spec.ts` and observe the current route remains `/community`.
- [ ] Add `meta: { requiresAuth: true }` to the route, use `protectedNavigation('/community')` in both header navigations, and apply `AuthGuard('jwt')` to community announcement and post-list handlers.
- [ ] Re-run the focused test and frontend build.

### Task 2: Retrieve Class Assignments for Approved Students

- [ ] Add a Jest test for `UserService.getClassAssignments` that rejects a pending member.
- [ ] Add a Jest test that provides two assignments, time-windowed accepted submissions, and expects only the requested class with correct `solvedCount`, `totalProblems`, and `completed` values.
- [ ] Run `npm test -- --runInBand src/user/user.service.spec.ts` and observe the missing method failure.
- [ ] Implement the member check, class lookup, ordered problem query, accepted-submission query, per-assignment time filtering, and response mapping in `UserService`.
- [ ] Expose `GET /api/user/classes/:classId/assignments` behind the existing JWT guard and re-run the focused Jest file.

### Task 3: Notify Members When Work Is Published

- [ ] Extend the existing create-assignment Jest case to expect `notification.createMany` for every approved member with `ASSIGNMENT` type and an assignment query link.
- [ ] Run `npm test -- --runInBand src/teacher/teacher.service.spec.ts` and observe the missing notification call.
- [ ] Add the notification mock, call `createMany` after assignment membership rows are created, and keep notification write errors from rejecting an already-persisted assignment.
- [ ] Re-run the focused teacher test.

### Task 4: Render the Student Assignment Workspace

- [ ] Add the protected student route `/classes/:classId/assignments` and the approved-card action in `StudentClasses.vue`.
- [ ] Create `StudentClassAssignments.vue` with loading/error/empty states, a selected-assignment control, deadline/progress summary, and ordered router links to existing problems.
- [ ] Read the route query `assignment` after loading and select it only when the returned assignment belongs to the requested class.
- [ ] Run the frontend router test and `npm run build`.

### Task 5: Validate and Deliver

- [ ] Run frontend Vitest and production build.
- [ ] Run backend Jest and production build.
- [ ] Inspect the resulting diff, commit the feature, and push only `42411109`.
