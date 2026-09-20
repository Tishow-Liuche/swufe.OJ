# Test-data ZIP actual-size protection

**Goal:** Accept ordinary highly compressible judge inputs while keeping decompression bounded. User approved the proposed actual-size approach and delegated implementation.

**Design:** Remove the 100:1 rejection. Keep upload 50 MiB, per-file 10 MiB, aggregate 100 MiB and 200 files. Validate declared budgets before decoding, then independently bound DEFLATE output (including a declared zero size), verify actual sizes and CRC-32 against the central directory, and reject encrypted/unsupported/corrupt entries with HTTP 400. Only STORE/DEFLATE are supported. No disk extraction, dependency changes, data migration or judge changes. Existing numeric-suffix pairing and immutable problem versions remain unchanged.

**Alternatives:** Raising the ratio merely moves the false-positive threshold; removing the check without bounded decoding permits forged-size bombs. Use bounded actual decoding instead.

**Execution:** Inline test-driven changes in existing isolated worktree.

- [ ] Add real highly compressed STANDARD/SPJ archives and malicious/invalid archives to `problem.service.spec.ts`; observe expected red tests. Retain resource-budget and pairing tests.
- [ ] Add `test-data-zip.ts` for bounded decoding and checksum verification; invoke from `problem.service.ts`, remove ratio gate, return meaningful 400 errors before any version writes. Run all backend tests/build.
- [ ] Independently review security-sensitive code, then deploy backend only with retained rollback image/config. Verify actual API high-ratio uploads for STANDARD/SPJ and corrupt rejection with isolated disposable fixtures, preserving old versions.
- [ ] Verify API, unchanged judge worker/tunnel and frontend; push student branch only and document results.
