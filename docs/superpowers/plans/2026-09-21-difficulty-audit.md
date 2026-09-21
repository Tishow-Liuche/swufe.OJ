# Full difficulty audit and repair

**Goal:** Check every stored problem against the user's original difficulty contract before changing data.

**Architecture:** Collect authoritative metadata separately from writes. CF official problemset ratings override stale local bands; Luogu numeric levels map 1→P0, 2/3→P1, 4→P2, 5→P3, 6→P4, 7/8→P5, 0→unrated. QOJ is always unrated. Missing fetches are not evidence of no rating. Local authored difficulty is preserved. Generate and review a dry-run manifest, back up rows, then apply only verified differences with optimistic old-value checks. Preserve raw rating provenance in source capability metadata without removing existing keys.

- [x] Collect full database metadata inventory, fresh CF catalog and Luogu metadata; distinguish current official data from existing crawl snapshots and unavailable records. Audit external accepted records as well as bank entries.
- [x] Add failing tests for absent ratings, numeric thresholds and Luogu unknown level. Fix shared mapping, import paths and sync consumers so unknown never defaults to P1/P0.
- [x] Add reproducible dry-run/apply audit script with validated inputs, per-row evidence, backup and drift checks. Never edit statements/test data, source IDs or authored problems.
- [x] Verify all rows covered or explicitly unresolved, review counts before applying. Run full backend/frontend tests and builds.
- [x] Deploy code and apply verified repair, re-run independent comparison, validate actual profile/filter responses and totals. No teacher worker changes or Caddy restart.
- [ ] Commit/push student branch with verification report; disclose unavailable external evidence and any push failures.

Reviewed exceptions: 30 CF records use explicitly labeled historical crawl ratings. Luogu P8952 returned HTTP 401 and retains its original difficulty as UPSTREAM_UNAVAILABLE; it is not claimed freshly verified. All other unresolved rows block writes. A second real CF sync preserved all 809 accepted records, 814 combined solved problems, and the corrected full-bank mapping.
