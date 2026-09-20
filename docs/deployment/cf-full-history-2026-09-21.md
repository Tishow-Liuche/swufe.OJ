# CF full-history synchronization release

## Behavior

- Fetch public CF submission history in pages of 1,000, with a gap greater than two seconds; retain the latest accepted submission per remote problem.
- Preserve accepted problems absent from the local problem bank. No placeholder Problem rows or fabricated statements are created.
- The accepted-problem list opens a missing-statement dialog for unavailable statements. Published local matches retain normal new-tab navigation.
- Distinct external records contribute to profile totals, difficulty distribution and solved-problem ranking. Overall points remain based on local OJ submissions.
- Dedicated durable queue, global concurrency one, user-scoped job IDs, authenticated status polling and refresh recovery. The legacy sync endpoint also enqueues work.
- Re-sync links previously unmatched records after their problems are imported. CF metadata updates can refresh ratings without rewriting unchanged JSONB objects.

## Verification

- Backend: 51 suites / 430 tests passed; Nest build passed.
- Frontend: 25 suites / 72 tests passed; TypeScript and Vite production build passed; profile UI static check passed.
- Migration tested in a rolled-back isolated PostgreSQL schema: old rows preserved, nullable FK accepted, deletion sets FK NULL, submission uniqueness scoped to user.
- Production schema and external-solve table backed up before applying migration `20260921000000_cf_unmapped_accepted`. All 34 migrations applied.
- Owned disposable accounts verified three records each (one local, two remote-only), repeat-sync idempotency, cross-user submission IDs, global totals and unchanged overall score.
- Real deployed browser verified desktop/mobile modal, keyboard close/focus restoration, matched links, pending-job restoration after refresh, user isolation and anonymous 401 responses. No page errors. Test accounts/jobs removed.
- Authorized bound-account full run: 2,477 submissions, 809 distinct accepted problems, 594 locally matched, 215 unmatched; 636 newly saved plus 173 existing records. Combined local/external total and global ranking both 814.
- Repeat run: 0 created, 0 updated, 809 unchanged.

## Deployment

- Backend image: `swufe-oj:cf-full-20260921`.
- Frontend image: `swufe-oj-caddy:cf-full-20260921`.
- Backend health verified; frontend assets copied before atomically replacing index. Caddy was not restarted, preserving the teacher judge tunnel.
- Judge queue remained unpaused, with one worker and zero active/waiting/failed jobs at verification. No teacher-server configuration changes.
- Private deployment backups are on the server under `/home/ubuntu/cf-full-20260921`; no secrets, account passwords or test archives are committed.

## Rollback constraint

Once remote-only rows exist, the former Prisma client expects a required relation and is not a safe drop-in rollback. Prefer a forward fix. A full rollback requires a reviewed data-restoration plan using the private backups and must not discard newer user records.
