# Test-data ZIP actual-size protection

**Goal:** Accept ordinary highly compressible judge inputs while keeping decompression bounded. User approved the proposed actual-size approach and delegated implementation.

**Design:** Remove the 100:1 rejection. Keep upload 50 MiB, per-file 10 MiB, aggregate 100 MiB and 200 files. Validate declared budgets before decoding, then independently bound DEFLATE output (including a declared zero size), verify actual sizes and CRC-32 against the central directory, and reject encrypted/unsupported/corrupt entries with HTTP 400. Only STORE/DEFLATE are supported. No disk extraction, dependency changes, data migration or judge changes. Existing numeric-suffix pairing and immutable problem versions remain unchanged.

**Alternatives:** Raising the ratio merely moves the false-positive threshold; removing the check without bounded decoding permits forged-size bombs. Use bounded actual decoding instead.

**Execution:** Inline test-driven changes in existing isolated worktree.

- [x] Add real highly compressed STANDARD/SPJ archives and malicious/invalid archives to `problem.service.spec.ts`; observe expected red tests. Retain resource-budget and pairing tests.
- [x] Add `test-data-zip.ts` for bounded decoding and checksum verification; invoke from `problem.service.ts`, remove ratio gate, return meaningful 400 errors before any version writes. Run all backend tests/build.
- [x] Independently review security-sensitive code, then deploy backend only with retained rollback image/config. Verify actual API high-ratio uploads for STANDARD/SPJ and corrupt rejection with isolated disposable fixtures, preserving old versions.
- [x] Verify API, unchanged judge worker/tunnel and frontend; push student branch only and document results.

## Verification and release

- 9 new regression assertions failed on previous implementation, including reproduced valid ZIP rejection and forged-zero bypass; all 405 backend tests across 49 suites now pass. Nest build passes on Node 20, deployed runtime Node 22.
- Decoder tests cover STORE/DEFLATE, known CRC vector, genuine empty deflated stream, actual/declared mismatch, absolute budget before decoding, encrypted/unknown method rejection and truncation. Independent security review found no blocking issues.
- Live authenticated HTTP audit first reproduced old HTTP 400 `ZIP 压缩比超过限制`; after deployment STANDARD/SPJ each successfully imported an ~855:1 input with exact content checks and retained old versions. Forged zero/short/oversized metadata, CRC corruption and malformed archives all return HTTP 400 without changing active version. Disposable accounts, sessions and problems removed.
- Release `ef6b3c7` pushed to `42411036` (including previously pending leaderboard commits). Backend-only patch image `swufe-oj:zip-budget-20260920`; rollback `swufe-oj:before-zip-budget-20260920`. Only two runtime JS files changed, no schema/dependency changes or migrations. Backend recreated with existing compose environment and healthy; proxy start time unchanged, queue unpaused and one worker connected.
- Retained limits: 50 MiB uploaded archive, 10 MiB per extracted file, 100 MiB aggregate, 200 files (not 200 paired test cases). No ZIP or test-data directory committed.
- Preexisting limitation: AdmZip parses central metadata before the file-count gate, and directories do not count as files. This change neither expands those limits nor claims full archive-parser isolation.
