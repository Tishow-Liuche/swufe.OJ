# Output-limit correction — 2026-09-26

## Root causes

- Problem outputLimit was saved but omitted from initial/rejudge queue jobs; runtime stdout max was fixed at 10 MiB.
- The deployed go-judge image contains `/opt/mount.yaml` with a 128 MiB `/w`; `-tmp-fs-param size=2g` does not override that file.
- Default POSIX file-size limit was 256 MiB, and shared cached-file storage was 2 GiB across eight concurrent jobs.

## Changes

Queue carries outputLimit; old jobs use the problem's current limit (64 MiB fallback). Output limits remain 4–1024 MiB in authoring. Contestant stdout is cached in go-judge, with only a 32K-character preview downloaded. SPJ receives the full cached file as stdin and `user_output`; standard judging streams full output with existing newline/trailing-whitespace semantics. Per-case output caches are deleted on normal/failure paths, including malformed replies that expose a cache ID. Compiler and checker stdout retain their small independent diagnostic limits.

The sandbox image raises `/w` capacity to 2 GiB and the POSIX ceiling to 2 GiB, above the maximum1 GiB stdout collector allowance. A POSIX ceiling equal to the collector maximum incorrectly reports RE on the first excess byte; headroom allows proper OLE collection. Production teacher-host shared-memory capacity becomes 16 GiB for eight workers, allocated on demand; the existing 32 GiB container memory ceiling and parallelism eight are unchanged. This does not reserve 16 GiB at startup or guarantee arbitrary heavy-job concurrency. Output page cache can count against a program's memory limit; output allowance does not override its memory/time limits.

The default local compose is intentionally small: use `GO_JUDGE_MEMORY_LIMIT` and `GO_JUDGE_SHM_SIZE` sized for the intended concurrency when testing large outputs. Its default 768 MiB memory/512 MiB shared-memory container is not a production 1 GiB-output configuration.

## Verification before release

- Backend 59 suites / 518 tests passed; production build passed.
- Isolated sandbox: 6,000,000 integers produced 46,888,890 bytes, accepted with 1024 MiB configured output allowance; full SPJ stdin and companion file checked. Returned preview remained 32,787 characters including marker.
- Same program with 4 MiB allowance returned OUTPUT_LIMIT_EXCEEDED.
- Standard comparison over 12 MiB accepted exact output and rejected a changed last character.
- Actual 1,073,741,824-byte boundary output accepted; SPJ (1024 MiB memory limit, matching production) verified full stdin length and companion-file length. One extra byte returned OUTPUT_LIMIT_EXCEEDED. Temporary test runner memory limited to512 MiB; sandbox separately limited to4 GiB. All diagnostic cache IDs removed.
- Read-only replay of original submission cmuihf6jz002p13yd47elbkb4, cases16/17: program accepted and original SPJ returned True on both (399ms/218ms in this run). No production submissions, scores or test data were created or changed by the replay.

Reproduce controlled sandbox checks with `packages/backend/scripts/test-output-limit.cjs`, `GO_JUDGE_URL`, and optional `PROBE_LARGE_OUTPUT=1`. Use an isolated/idle authorized sandbox; the boundary test temporarily consumes over1 GiB sandbox memory/storage and should not be run during a busy contest. A passing large-output test is not a claim of 200/500-user contest capacity.
