# Student Assignments and Community Access Design

## Goal

Approved students can open a class assignment workspace from My Classes, inspect its problems and due time, and continue each problem in the existing problem page. Publishing an assignment creates an in-app notification for every approved class member. Community content requires an authenticated session.

## Access Control

- Add `requiresAuth` to `/community` and route unauthenticated navigation to `/login?redirect=/community` through the existing global guard.
- Require the existing JWT guard for community announcement and post-list endpoints. The post detail and all mutation endpoints already require it.
- The student assignment API verifies an `APPROVED` `ClassMember` record for the requested user and class before returning data. Pending and rejected members receive a forbidden response.

## Student Assignment API

`GET /api/user/classes/:classId/assignments` returns the class name and its assignments. Each assignment contains ordered published problem metadata and progress for the current user.

Progress is based on accepted local submissions for an assignment problem during that assignment's start and end time. The response contains `solvedCount`, `totalProblems`, and `completed`; no new persistence model or submission flow is introduced.

## Notifications

After the assignment, its problem links, and assignment-student rows are persisted, the teacher service creates one `ASSIGNMENT` notification per approved member. The link is `/classes/:classId/assignments?assignment=:assignmentId`, which opens the corresponding class assignment in the student view.

Notifications are a non-blocking publication side effect: an individual notification write failure cannot make an already-persisted assignment appear to have failed. The implementation uses `notification.createMany` inside a guarded block, while assignment persistence remains unchanged.

## Student Experience

- An approved membership card shows a `Class assignments` action; pending and rejected cards do not.
- The new assignment route displays the class, assignment selector, start/due time, completion progress, and ordered problem rows.
- Problem rows are normal router links to `/problems/:id`, so the current editor, judge, and submission history remain the authoritative completion path.
- A notification query parameter preselects the notified assignment, with a safe fallback to the first returned assignment.

## Verification

- Frontend route coverage proves unauthenticated `/community` navigation is redirected to login.
- Backend service coverage proves unapproved members cannot list work, approved members receive only their class work and windowed completion counts, and publication creates notification rows for approved members.
- Build frontend and backend, run focused tests and full test suites, then manually verify the notification route and student problem links in the running app.
