# Session and judging infrastructure resilience

> For agentic workers: use subagent-driven-development, TDD and independent reviews. User authorizes autonomous repair and deployment; no main push.

**Goal:** preserve legitimate sessions and accepted contest work through bounded transient failures, with explicit tested limits rather than a zero-failure promise.

**Architecture:** retain PostgreSQL beside API on the main host. Evidence at 14:46 UTC: available RAM 634 MiB, DB 164/384 MiB, no OOM/restarts, no DB crash near failure. Teacher disk 98% used, 88 GiB free. Moving DB would make all API/auth operations depend on the cross-host tunnel. Worker logs establish DB reachability/pool errors but not their physical cause. Improve application recovery first.

**Alternatives:** database migration adds network exposure to API without proving memory pressure; merely increasing pool size cannot heal a broken transport. Chosen design keeps topology, adds response-loss-safe refresh and durable bounded infrastructure retries, then exercises isolated real database/Redis faults.

## Tasks

- [x] Auth: reproduce lost refresh response with same old cookie. Optional random 256-bit retry key permits deterministic HMAC successor token, existing session hash remains sole authority. Recover only the exact key/cookie pair while successor exists, is unexpired and created within five minutes. Missing/wrong keys, logout, revoked sessions and expired recovery must fail. No schema migration or plaintext credential storage. Serialize rotation transaction; frontend shares only pending retry key under existing browser lock, clears on definitive completion/logout and retains after transient errors. Legacy clients retain single-use refresh. Recovery resolves the same per-user throttle bucket, retaining the aggregate IP cap. Keyed logout deletes old row before successor in one transaction to handle concurrent rotation.
- [x] Judge: test transient DB outage beyond ordinary retry count. Persist first infrastructure-failure time in job data, move job to delayed (bounded backoff, release worker slot), throw BullMQ DelayedError. Recover evaluation for up to 30 minutes, then persist an expiredAt marker in Redis and retry only explicit infrastructure-failure publication once per minute until DB returns; never abandon an in-progress DB row or fake a verdict. Existing durable verdicts always win, including lost acknowledgement of final writes. Include Prisma raw-query wrapped and code-less initialization connection errors. Include delayed jobs in admission cap to keep backlog bounded. Do not retry programming/schema/authentication errors as outages.
- [ ] Add real isolated integration probes: dropped auth response retry and revoked successor; real BullMQ delayed transition after repeated injected database connection failures then restoration; eight independent read-only DB connections across actual teacher tunnel. Production queue and database must not be interrupted for a fault test.
- [ ] Full regression/build and independent specification/security review. Deploy API/frontend/worker with backups and drain; verify hashes/health/queue and bounded real sandbox smoke. Push only 42411036. Remove isolated schemas, containers, tokens. Report tested duration and limits; no claim of 100% availability.

Use existing isolated worktree; no edits to unrelated main checkout. Auth files belong to auth implementer; judging/ops/docs to root. Temporary diagnostics stay outside Git. No new capacity commitments or modifications to teacher training workloads.
