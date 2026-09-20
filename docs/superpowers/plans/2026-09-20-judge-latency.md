# Judge latency: measured remediation

**Goal:** Several simultaneous submissions should start promptly without increasing teacher-server resource limits or weakening judge correctness.

**Approved direction:** Keep PostgreSQL on the web host. Fix communication first; only add caches/buffering if the controlled measurements still justify them. User delegated implementation and verification without further approval gates.

**Evidence:** Worker concurrency and go-judge parallelism are 8. Database round trips over the existing Cloudflare-routed WebSocket tunnel are ~537 ms. Direct host RTT is ~4 ms; HTTPS direct-origin test validates the existing certificate and completes in ~26 ms. Tunnel reconnect reported 557 ms latency.

**Design:** Change only the judge tunnel's destination to the origin IP, explicitly retaining the original TLS SNI and HTTP Host. Preserve auth, fingerprint, loopback bindings, forwarding targets, service hardening, and all resource limits. Never expose database/Redis ports or disable TLS validation. Back up the unit; drain/pause queue during restart and resume its prior state. Roll back if direct connection/queries fail. Do not migrate data or change historical verdicts.

**Alternatives:** Database migration moves latency to the website; raising concurrency increases contention; neither addresses the demonstrated network detour. Application snapshot caching and write buffering remain contingent on post-route results.

## Execution (inline)

- [x] Confirm worktree isolation and baseline judge tests (47 passing).
- [x] Compare tunnel route and direct-origin TLS/RTT.
- [x] Add an isolated live concurrency audit: clone a pinned accepted fixture without printing source/tests; create a disabled audit user; enqueue 2/4/8 jobs in bounded waves; verify AC, all cases, task completion and overlap; clean up only terminal jobs and owned fixtures.
- [x] Run baseline wave and record queue/processing latency.
- [x] Add/test strict systemd ExecStart transformation: origin IP + hostname/SNI; fail closed on unexpected unit; preserve auth and forwarding options. Tests precede implementation.
- [x] Check queue empty, pause/drain, back up service unit, apply transformation, restart tunnel only, verify database/Redis and resume queue. On failure restore unit and original pause state.
- [x] Run same fixture after change with 2/4/8 concurrent submissions. Re-run verdict regression. Inspect resources and logs; compare before/after, not configured parallelism alone.
- [ ] Commit reproducible tooling and sanitized measurements to 42411036; leave secrets, source/test data and live unit out of git.

Acceptance: all audit verdicts/cases correct, observed parallel task intervals, queue delay normally <2 s for <=8 jobs when idle, direct DB round trips <50 ms in this environment; report measured exceptions. No claim of arbitrary contest capacity or zero failures.
