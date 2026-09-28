# Session and judging infrastructure resilience

> For agentic workers: use subagent-driven-development, TDD and independent reviews. User authorizes autonomous repair and deployment; no main push.

**Goal:** preserve legitimate sessions and accepted contest work through bounded transient failures, with explicit tested limits rather than a zero-failure promise.

**Architecture:** retain PostgreSQL beside API on the main host. Evidence at 14:46 UTC: available RAM 634 MiB, DB 164/384 MiB, no OOM/restarts, no DB crash near failure. Teacher disk 98% used, 88 GiB free. Moving DB would make all API/auth operations depend on the cross-host tunnel. Worker logs establish DB reachability/pool errors but not their physical cause. Improve application recovery first.

**Alternatives:** database migration adds network exposure to API without proving memory pressure; merely increasing pool size cannot heal a broken transport. Chosen design keeps topology, adds response-loss-safe refresh and durable bounded infrastructure retries, then exercises isolated real database/Redis faults.

## Tasks

- [x] Auth: reproduce lost refresh response with same old cookie. Optional random 256-bit retry key permits deterministic HMAC successor token, existing session hash remains sole authority. Recover only the exact key/cookie pair while successor exists, is unexpired and created within five minutes. Missing/wrong keys, logout, revoked sessions and expired recovery must fail. No schema migration or plaintext credential storage. Serialize rotation transaction; frontend shares only pending retry key under existing browser lock, clears on definitive completion/logout and retains after transient errors. Legacy clients retain single-use refresh. Recovery resolves the same per-user throttle bucket, retaining the aggregate IP cap. Keyed logout deletes old row before successor in one transaction to handle concurrent rotation.
- [x] Judge: test transient DB outage beyond ordinary retry count. Persist first infrastructure-failure time in job data, move job to delayed (bounded backoff, release worker slot), throw BullMQ DelayedError. Recover evaluation for up to 30 minutes, then persist an expiredAt marker in Redis and retry only explicit infrastructure-failure publication once per minute until DB returns; never abandon an in-progress DB row or fake a verdict. Existing durable verdicts always win, including lost acknowledgement of final writes. Include Prisma raw-query wrapped and code-less initialization connection errors. Include delayed jobs in admission cap to keep backlog bounded. Do not retry programming/schema/authentication errors as outages.
- [x] Add real isolated integration probes: dropped auth response retry and revoked successor; real BullMQ delayed transition after repeated injected database connection failures then restoration; eight independent read-only DB connections across actual teacher tunnel. Production queue and database were not interrupted for a fault test.
- [x] Full regression/build and independent specification/security review. Deployed API/frontend/worker with backups and drain; verified hashes/health/queue and bounded real sandbox smoke. Pushed only 42411036. Removed isolated schema, containers and token manifest. Limits below do not imply 100% availability.

Use existing isolated worktree; no edits to unrelated main checkout. Auth files belong to auth implementer; judging/ops/docs to root. Temporary diagnostics stay outside Git. No new capacity commitments or modifications to teacher training workloads.

## Verification and deployment

Runtime commit `a6ea21c63d24a76ec6ce37b14dcaedaa8e22d0c5` deployed to main API/frontend and teacher worker. The following documentation-only commit does not change deployed runtime. No main branch push, database migration, password change or historical rejudge.

- Full backend: 68 suites / 692 tests passed. Full frontend: 37 suites / 141 tests passed. Both production builds passed; pre-existing Rollup annotation/chunk warnings remain.
- Specification review caught durable-verdict acknowledgement loss, expiry publication during continued DB outage, and cross-tab logout ordering. All fixed with regressions. Independent quality review additionally caught skipped assignment/wrong-book updates during acknowledgement-loss recovery; shared notification path fixed and approved. Notifications remain best-effort, not an exactly-once delivery guarantee.
- Real isolated API: 100 accounts sharing one IP rotated successfully, then an HTTP proxy destroyed every response before delivering cookies/body. All 100 recovered using old cookie plus same retry key and read their own identity; P95 898 ms, max 904 ms. Revoked, older-than-five-minute, wrong-key and missing-key recovery rejected.
- Real isolated PostgreSQL/BullMQ: TCP proxy refused database connections for 45 seconds. Job configured with only one ordinary attempt entered durable delay three times, then recovered on execution four after approximately 70.5 seconds without SYSTEM_ERROR. Queue active slot released during delays. Judge calculation was a deterministic fixture stub; this test verifies database/queue recovery, not sandbox load capacity. Genuine code-less Prisma initialization errors were observed and added to classification coverage.
- Real teacher-to-main DB path: eight independent connections for 120 seconds, 952 SELECT 1 queries, zero failures, P50 6 ms, P95 10 ms, max 414 ms. This is a sampled latency check, not a long-duration network guarantee.
- After deployment, live teacher sandbox smoke: normal AC 20 ms; CPU loop TLE 1101 ms; infinite output MLE 143 ms; 100,000-line C++ compile passed. Existing worker/sandbox resource limits unchanged. Production queue resumed with zero active/waiting/prioritized/delayed jobs at verification.
- HTTPS health OK. Public index and all seven deployed API JS hashes matched local build; teacher processor/outage helper hashes also matched. API restarted with two brief startup health-probe 502 responses, then healthy. Old containers/images and runtime backups retained for rollback.
- Isolated API/Redis containers, pressure schema and test token manifest removed. Production data and sessions were not reset.

## Residual limits

No OOM or PostgreSQL restart evidence was found for the historical final-minute fault. The worker observed pool/reachability failures, but the physical transport cause is not conclusively established. Keeping DB local to API avoids moving all login/submission traffic across this tunnel; teacher host has 98% disk utilization. Database migration is not justified by the available evidence.

Exact refresh-response recovery is bounded to five minutes and requires retained browser retry state. Database evaluation recovery is bounded to thirty minutes; after that the durable queue marker requests explicit infrastructure-failure publication when DB access returns, without more judging. Persistent Redis loss, power loss, disk exhaustion, cookie deletion, revoked credentials and longer outages remain operational risks. Automated tests, two-minute probes and one fault duration cannot certify zero failures or 100% future availability.
