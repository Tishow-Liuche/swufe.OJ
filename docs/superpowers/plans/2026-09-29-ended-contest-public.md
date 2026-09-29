# Ended contest public read access

Goal: all contest types expose standings, paginated submission records and submitted code to everyone after the official end time, including anonymous visitors. Before that boundary, existing authentication and participation restrictions remain unchanged.

Design: optional authentication only on contest metadata, standings, submission feed and submission detail GET endpoints. Services enforce the end-time boundary using server time before granting anonymous access. Never change write endpoints, judge workers or test-data visibility. Ended contests become discoverable in both contest lists. Code detail continues to require the submission to belong to the requested contest and uses contestant-safe test results for non-managers.

Implementation and verification:

- [x] Add parameterized service tests for PUBLIC, PASSWORD, PRIVATE and CAMPUS_PRIVATE, ACM and IOI, anonymous and unenrolled users. Include before/end boundaries, wrong-contest submission IDs and hidden-test redaction.
- [x] Add guest route/feed tests, list-discovery tests and submission pagination coverage; run new tests before implementation and confirm expected failures.
- [x] Implement optional read authentication and server-side end-time permissions. Use bounded 80-row pages with an 81st-row hasMore check, never an unbounded feed.
- [x] Open contest viewing routes and navigation, hide guest-only-mine controls, preserve authentication for actual participation, add page controls with reset on filter changes.
- [x] Run backend contest/auth/privacy tests and frontend contest/router tests; build both packages; review the diff for unintended permission expansion. No database migration or judge configuration change is required.

Commands: backend `node node_modules/jest/bin/jest.js src/contest --runInBand`; frontend `node node_modules/vitest/vitest.mjs run src/views/contest src/router/index.spec.ts`. Production deployment is not implied by a passing local build; report its actual status separately.

Verification (2026-09-29): 198 backend tests across contest/auth/account-throttler/submission-privacy suites passed; all 173 frontend Vitest tests passed. Nest build, vue-tsc and Vite production build passed. Vite reports existing dependency PURE-annotation and bundle-size warnings. Review found and closed a fresh-tab login restoration race: ContestArena now reloads on authenticated identity change, covered by a failing-then-passing test. Work remains local; no production deployment, database change, judge restart or GitHub push performed.
