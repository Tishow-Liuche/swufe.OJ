# Historical Problem Authoring Design

## Goal

Add a historical problem-authoring module so teachers/admins can find and repair local problems they previously entered, including statement fields, samples, judge mode, SPJ checker, status, tags, and ZIP test data.

## Current state

- The existing authoring page is `packages/frontend/src/views/admin/CreateProblem.vue`.
- It creates a local problem through `POST /api/problems`, uploads ZIP test data through `POST /api/problems/:id/testdata`, and optionally publishes with `PATCH /api/problems/:id/status`.
- The backend already has `PATCH /api/problems/:id`, but it only updates a subset of fields and does not fully update the current version, checker, tags, or test data.
- `Problem` currently has no creator field, so the platform cannot reliably answer “which problems did this user enter?”

## Chosen approach

Use a complete, maintainable authoring-management flow:

1. Add creator ownership to local problems.
2. Add a historical listing endpoint.
3. Strengthen the existing update endpoint to update the current local problem version completely.
4. Reuse the ZIP test-data replacement endpoint for edits.
5. Add frontend pages for history and edit.

This is better than a shallow list-only patch because test data and SPJ configuration are the parts most likely to be wrong and must be editable from the same workflow.

## Backend design

### Data model

Add `Problem.createdBy String?` and relation to `User.authoredProblems`.

Existing rows will initially have `createdBy = null`. Admins can still see and edit all local problems. Teachers see local problems they authored; legacy unowned local problems are admin-managed unless later assigned.

### API

Add:

- `GET /api/problems/mine/created`
  - Auth required.
  - Teacher: local problems where `createdBy = current user`.
  - Admin: all local problems.
  - Supports `keyword`, `status`, `page`, and `pageSize`.
  - Returns current version summary, checker mode, tags, test case count, and submission count.

Strengthen:

- `PATCH /api/problems/:id`
  - Auth required.
  - Teacher can update only own local problems.
  - Admin can update any local problem.
  - Remote imported problems are not edited by this authoring module.
  - Updates base fields, tags, current version statement/sample fields, and checker.
  - If judge mode changes to SPJ, checker language/source is required.
  - If judge mode changes back to STANDARD, checker is reset to STANDARD.

Reuse:

- `POST /api/problems/:id/testdata`
  - Adds the same local-problem ownership check.
  - Replaces all current test cases from ZIP.

### Publishing behavior

`PATCH /api/problems/:id/status` keeps the current rule: local problems cannot be published without test cases.

## Frontend design

Add routes:

- `/admin/problems/history`
- `/admin/problems/:id/edit`

Add navigation:

- Keep “录题” for creating new problems.
- Add “历史录题” for the history list.

Add pages/components:

- `ProblemHistory.vue`: searchable table/cards with title, status, difficulty, judge mode, test count, updated time, actions.
- Extend `CreateProblem.vue` into dual create/edit mode based on route params:
  - create mode keeps requiring ZIP before first creation.
  - edit mode loads existing problem, allows optional ZIP replacement, and saves through `PATCH`.

## Validation

Backend tests:

- creating a problem stores `createdBy`;
- history endpoint filters by creator for teachers and includes all local problems for admins;
- teacher cannot edit another teacher’s local problem;
- updating a problem updates current version, tags, checker, and base fields;
- uploading test data enforces ownership;
- publishing still fails when no test data exists.

Frontend verification:

- `npm run build` must pass.
- Smoke test local pages and API after restart.

## Out of scope

- Full audit log diff and rollback UI.
- Assigning legacy unowned problems to a teacher.
- Editing remote imported Codeforces/Luogu/QOJ problems from this module.
