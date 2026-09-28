# Contest capacity implementation plan

> Execute inline using executing-plans, test-driven-development and verification-before-completion. User requested the most reasonable optimization after the failed isolated load test; no additional deployment or infrastructure scope is inferred.

**Goal:** Remove demonstrated read/write contention and shared-IP throttling for the next 100-person contest, without changing scoring, judge concurrency, source-code visibility or authentication security.

**Architecture:** Fresh minimal contest authorization precedes every cached response. Per-process bounded read cache coalesces concurrent requests; standings TTL 2 seconds, unfiltered submissions TTL 1 second. Cache keys separate manager/participant, upcoming/live/frozen/ended phases and contest updatedAt; filtered and only-mine submissions remain uncached. JWT-verified subject-based throttling applies to authenticated requests outside authentication endpoints; absent/invalid tokens retain IP limits. No DB migration or pool change unless repeated measurements justify it.

**Tech stack:** NestJS, Prisma/PostgreSQL, Redis/BullMQ, Jest, isolated same-host load harness.

## Tasks

- [x] Add `common/bounded-read-cache.ts` and `.spec.ts`: `get(key, ttlMs, load)` reuses cached values, single-flights concurrent loads, does not cache errors and caps cache+inflight keys at 128. Demonstrate failing tests before implementation.
- [x] Add `contest/contest-read-capacity.spec.ts`: mock minimal access and full loader queries separately; 20 concurrent standings reads should perform one heavy query; repeat reads should not repeat heavy query; private nonparticipants must be rejected before cache access; manager and frozen scopes must not share entries. Update `contest.service.ts` wrappers accordingly; unfiltered feed cache only, personal/search feeds retain filters.
- [x] Add `common/account-throttler.guard.ts` and `.spec.ts`: verify JWT signature/expiry before taking `sub`; never trust decoded-only JWT or caller-provided identity headers. Authentication endpoints retain IP protection, with login/refresh identity buckets as amended below. Wire global provider and update security baseline expectation. Retain route limit/TTL decorators.
- [x] Run `npm test -- --runInBand` and `npm run build` in backend, get independent security/concurrency review, fix findings.
- [x] Recreate prior isolated 100-user/8-problem/2000-submission fixture on the same 2-core host. Patch only test API files, not production. Re-run exact 20/50/100-user phases plus shared-IP scenario with synthetic judging; keep 12-second timeout and safety stops. Retain raw before/after data. If passed, run near-boundary 5.2-second submission interval to distinguish cooldown rejects from actual overload, and public resource check.
- [ ] Record results and limitations, commit/push only `42411036`; deploy changed compiled API files via derived image with backups and health rollback; run read-only production privacy/identity checks and confirm no test schema, tokens, queues, containers remain. No teacher-host changes.

## Acceptance

No 5xx/timeouts at 100-user isolated mixed load; report actual accepted and rate-limited submissions separately. Shared-IP authenticated requests are independent per account; unverified tokens cannot split the IP bucket. Tests prove cache authorization, frozen/ended separation and only-mine/search correctness. No claim of real-browser or real-judge capacity from synthetic API tests.

## Review-driven amendment: shared-IP login and renewal

Keeping the old 5/IP/min limit on login/refresh still prevents a shared classroom from logging in or renewing sessions. Preserve the route limit of 5/min, but bucket login by bounded normalized login identifier without checking account existence, and refresh by user ID only after validating its random cookie hash against an unexpired database session. Apply an additional independent 300/IP/min cap to each of login and refresh before identity lookup. Invalid refresh cookies remain in the anonymous IP bucket. Register, recovery and other auth limits remain unchanged (including the existing 3/min recovery-code route). This is identity-level rate limiting, not an authentication bypass; AuthService still performs password/session checks. Username and email aliases may be distinct login buckets; no new account-existence lookup is added.
