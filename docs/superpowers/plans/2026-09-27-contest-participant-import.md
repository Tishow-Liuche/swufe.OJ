# Administrator contest participant import

Approved requirements: single-account/student-ID addition and Excel/CSV batch import, all visibility/scoring/team flags; administrators only; bypass registration window/password, not contest end; preserve existing participants; campus identity must match bound student ID with valid real name; no additional contest time.

1. Add backend tests covering ADMIN authorization, ended contests, all mode/visibility combinations, duplicate/retry idempotency, malformed rows, deleted users and campus identity mismatch.
2. Add POST /api/contests/:id/participants/import. Accept up to500 explicit username/studentId/realName rows; exact unique account lookup, never fuzzy nickname matching or account creation. Return per-row imported/skipped/invalid results. Validate before insertion, use createMany skipDuplicates; read contest end within transaction and invalidate standings cache after commit.
3. Add isolated frontend ContestParticipantImport.vue below registration for ADMIN only. Single-add fields; lazy XLSX import, bounded file/row counts, preview table, download template, confirm-import button and per-row results. Never auto-import on file selection. Reuse contest styling and emit reload after successful writes.
4. Test parsing (text IDs preserved, aliases, malformed files) and UI visibility/submit/result rendering. Run full suites/builds and independent review.
5. Verify using isolated test schema, never enroll real users for diagnostics. Push42411036 and deploy frontend/API only with rollback and asset/health checks. Do not alter judge servers or existing contest scores.
