# Judge latency remediation — 2026-09-20

## Cause and production change

The teacher-host worker connected to PostgreSQL, Redis and MinIO through an authenticated chisel HTTPS/WebSocket tunnel using the public website hostname. That hostname resolved to Cloudflare, adding ~557 ms to the tunnel despite direct host-to-host RTT of ~4 ms. The worker's sequential database calls and queue operations magnified the detour.

Changed **only** `swufe-judge-tunnel.service` on the worker host to dial the existing origin IP, with the original hostname explicitly retained as HTTP Host and TLS SNI. TLS certificate verification remains enabled. The chisel server fingerprint was checked against origin-host logs and pinned. Credentials, all localhost-only forwarding ports, service hardening, worker image, concurrency 8, sandbox parallelism 8 and resource limits are unchanged. PostgreSQL was not moved. No public database/Redis ports were opened.

Queue was idle, paused during the switch, then restored to unpaused after database and worker connectivity checks. No active submission was interrupted. The original service is retained as `/etc/systemd/system/swufe-judge-tunnel.service.before-direct-20260920`. Database contents and historical submissions were not changed.

## Controlled measurement

An accepted C solution and its pinned 55-case SPJ version from T24292 were cloned into a temporary reserved fixture, with a disabled diagnostic account. Existing submissions were not rejudged or changed. Each wave used the real queue and sandbox; all cases and completed judge tasks were checked. Fixture code/test data are deliberately absent from reports and git. Diagnostic accounts, problems, submissions and queue jobs were cleaned up after completion.

| Measurement | Before | After |
| --- | --- | --- |
| Connected tunnel RTT | 556.7 ms | 4.1 ms |
| Warm DB `SELECT 1` | 533–542 ms | 5–6 ms |
| 8 simultaneous trivial DB reads, including fresh pool connections | 5,312 ms total | 58 ms total |
| Same fixture, 4 concurrent jobs: processing time per job | 45.464–50.775 s | 4.254–4.424 s (repeat) |
| Same fixture, 2 concurrent jobs | not measured | 3.934–3.957 s (repeat) |
| Same fixture, 8 concurrent jobs | not measured | 4.964–5.448 s (repeat) |

After-route tests were repeated: first 8-job wave took 5.266–5.608 s; second took 4.964–5.448 s. All 28 post-change submissions were AC with 55/55 cases. Observed peak active jobs matched 2, 4 and 8 respectively. Latest enqueue-to-worker timestamp deltas ranged from -8 to 28 ms; tiny negative values reflect producer/worker clock skew, **not negative waiting time**. Describe these as tens-of-milliseconds startup, not exact sub-millisecond latency.

Before-route 4-job start delays were 674, 1263, 1899 and 2532 ms. Its original report `pass` covered correctness only; the finalized audit now separately asserts verdicts, actual overlapping processing intervals and queue latency <2 s (rejecting gross clock skew). Both latest post-route waves and metrics unit tests meet the stricter criteria.

## Regression and safety checks

- 47 existing processor/wiring unit tests passed before change. No runtime application code changed.
- 6 origin-unit transformation tests passed, including rejected insecure/quoted destinations and conflicting pins.
- 2 concurrency metrics test groups passed, rejecting serialized, delayed, missing-case and invalid-timestamp runs.
- 33 live judge regression cases passed after switch: C/C++/Python/Java, AC/WA/CE/TLE/MLE/RE/output limits, checker failures, pinned versions, fail-fast TLE and partial scoring. LEGACY compatibility case remains compatibility-only, not a proof of checker correctness.
- Independent tooling review findings fixed and re-reviewed: quoted URL handling, asserting performance as well as verdicts, and retaining fixtures on ambiguous enqueue failure.
- Post-test queue: unpaused, active 0, waiting 0, failed 0, worker connected. No subsequent tunnel reconnect or database-connection errors observed during this short verification window.
- Teacher-host post-test snapshot: worker ~87 MiB, sandbox ~246 MiB; load ~0.79/0.19/0.06. This is a snapshot, not a peak utilization guarantee. No training-related services were modified.

## Reproduce and maintain

`scripts/ops/judge_tunnel_origin.py` generates a candidate unit only. It requires the existing unit, origin IP, valid website hostname, and an independently verified server fingerprint. Keep the current server key persistent; do not silently accept a changed fingerprint. A new origin IP or TLS hostname requires revalidation.

1. Validate direct-origin HTTPS using `curl --resolve HOST:443:ORIGIN_IP https://HOST/api/health`; do not use `-k`.
2. Back up the existing systemd unit. Run the generator with `--unit`, `--output`, `--origin`, `--hostname`, `--fingerprint`. Output is exclusive-create and mode 0600; it may contain credentials, so never commit it.
3. Pause queue and wait for active=0, remembering the prior paused state. Install candidate, reload systemd and restart **only** the tunnel. Verify tunnel authentication and DB/Redis access, then restore queue state.
4. On failure, restore the exact backed-up unit, reload/restart the tunnel and verify before restoring queue state. Do not leave a paused queue behind.
5. Run `JUDGE_CONCURRENCY_AUDIT=1 node scripts/check-judge-concurrency-live.cjs` in the authorized backend container with its normal environment and an idle queue. `AUDIT_WAVES=2,4,8` and `AUDIT_PROBLEM_NO=24292` are defaults. This creates temporary private fixtures and requires an existing accepted pinned solution. On unknown enqueue outcomes or nonterminal jobs it deliberately retains fixtures for safe manual cleanup; inspect reported job/account IDs before removing anything.
6. Run `JUDGE_INTEGRITY_AUDIT=1 node scripts/check-judge-integrity-live.cjs` for full verdict regression.

These measurements validate this fixture under the current light load, not zero queueing for all programs or any claimed 200/500-person contest capacity. More than 8 active jobs and long-running cases can still queue. Application caching/buffered writes were deliberately deferred: removing the measured route detour already achieved prompt startup without adding correctness or memory complexity.
