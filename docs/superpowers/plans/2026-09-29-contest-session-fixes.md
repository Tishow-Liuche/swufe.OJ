# Contest session safety implementation plan

> **For agentic workers:** Use subagent-driven-development for the independent backend task; main agent owns frontend integration and verification. Review changes before release.

**Goal:** Repair the three confirmed findings in contest-pressure-audit-20260929.md, as requested by the user.

**Architecture:** Retain credential validation and abuse ceilings. Give verified refresh sessions a separate 60/user/minute and 6000/IP/minute budget (100 users × 60), leaving invalid cookies at 5/IP/minute and login at existing limits. Stamp outgoing requests with a stable login identity epoch, separate from ordinary access-token rotation. Retry transient read failures in the contest arena with capped backoff and cancellation, never automatically replay failed writes except authenticated same-session 401 recovery.

**Tech Stack:** NestJS/Throttler/Jest; Vue/Axios/Vitest.

## Tasks / acceptance checklist

- [ ] Backend: first add HTTP tests to `common/account-throttler.auth.spec.ts` proving six valid rotations and 100 users × 10 restores pass, while invalid cookies remain limited and account/IP budgets cannot be bypassed. Run `npm test -- --runInBand account-throttler` red, implement guarded verified-session budgeting, run green. Do not trust JWT sub or supplied identity without verification; avoid duplicate DB lookup.
- [ ] Client: add adapter-level tests in `api/client.spec.ts` for account switch and logout before a delayed 401, and same-session rotation control. Run `npx vitest run src/api/client.spec.ts` red. Capture stable identity epoch in request metadata; reject stale responses/retries before changing auth, preserve same-session renewal. Add tests and serialization for login/register Cookie writes if implementing the adjacent confirmed Cookie ordering gap.
- [ ] Arena: mount actual `ContestArena.vue` with HTTP boundary substituted, fake timers and route change; test 503/429 retry, boundary recovery, no retry for 403/404, cancel on navigation/unmount. Implement capped backoff with Retry-After support and preserve existing contest data.
- [ ] Run complete frontend tests/build and backend relevant tests/build. Independently review authentication and scheduling code. Never claim production fix from unit results alone.
- [ ] Verify real API multiple-page refresh/recovery in isolation with new backend, keep credentials out of output. Recheck production contest/queue status before any release. Back up changed runtime files, preserve environment/JWT/database, release only verified artifacts if safely within maintenance conditions, compare hashes and health afterward. No main push or database migration.

## Boundaries

No UI redesign, judge-rule changes, new data schema, indefinite POST retries or claim of zero-failure capacity. Existing audit/tests are preserved. Work in existing detached linked worktree; don't overwrite user branches. Prior user instruction to proceed without additional approval applies to this repair plan.

## Implementation checkpoint (12:10 Beijing)

Code tasks complete: verified refresh budget, stable request identity epoch plus synchronous capture, cross-account refresh subject guard, serialized login/register/refresh/logout Cookie operations, latest-intent protection for pending login, and arena retry/backoff. New regression tests failed against the old behavior before implementation. Independent review's two login/logout ordering findings were reproduced and corrected; final reviewer found no remaining blocking issue.

Frontend 39 files / 163 tests pass; backend 68 suites / 693 tests pass. Both production builds succeed (frontend retains pre-existing third-party annotation and large-chunk warnings). Real isolated API 100 users × 10 page restores gives 1000 successful refreshes, with identity verification; p95 refresh 286 ms. The 17-minute mixed-load run is still in progress: no release or zero-failure certification is claimed at this checkpoint. Final results and deployment verification will be recorded separately.

## Final checkpoint

All tasks above completed and verified, including independent review, full 17-minute real-expiry load, database reconciliation, response-loss recovery, deadline boundary, production deployment and public hash verification. Code commit `3f5bdc2` is pushed to `42411036` and deployed. See `docs/contest-session-fix-verification-20260929.md` for the final metrics and explicit limitations. The earlier checkpoint remains historical, not the current release status.
