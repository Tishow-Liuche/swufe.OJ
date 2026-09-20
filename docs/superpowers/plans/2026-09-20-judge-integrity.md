# Judge integrity implementation plan

**Goal:** Fix the reproduced SPJ/error/version defects without changing historical verdicts or breaking existing exit-code checkers.

**Architecture:** Add Checker.protocol (LEGACY default for existing rows; new authoring defaults BOOLEAN_STDOUT). Implement explicit verdict handling and diagnostic metadata. Use immutable ProblemVersion clones for checker/test-data edits, serialized per-problem publication. Judge submitted version, not latest; rejudge uses original snapshot. Keep queue time/memory limits captured at submission. Reject unsupported/malformed runtime responses and missing artifacts, bound HTTP requests.

**Stack:** NestJS, Prisma/PostgreSQL, BullMQ, go-judge, Vue.

## Contract

- BOOLEAN_STDOUT: successful process plus explicit true/false token (including 1/0 and recognized boolean aliases) required; empty/invalid verdict is SYSTEM_ERROR. EXIT_CODE: 0 accepted, 1/2 wrong, >=3/system fault/signal/timeout system error. LEGACY retains stdout booleans and zero-exit/no-output acceptance; exposes compatibility warning and upgrade selection. No automatic protocol inference from arbitrary source.
- Preserve exitStatus, signal/error and stderr from sandbox; diagnostic checker failures do not become contestant WA. No partial score for SYSTEM_ERROR.
- New version publication is atomic, test case replacement cannot temporarily erase live data. Queued submission reads its stored version. No fallback to current when a recorded version is missing.
- Do not edit old submissions, scores, user credentials, homepage, judge host resource limits, or training data.
- Retest earlier 22-case matrix with explicit protocol cases. Preserve existing legacy-compatible fixtures; do not weaken assertions to make failures disappear.

## Tasks

- [ ] Sandbox/processor: write regression tests for checker crash/timeout/system failures, boolean empty, exit-code outcomes, missing artifacts, invalid responses, deadlines; observe failures. Implement JudgeService metadata and protocol interpreter, persisted-version loading, bounded requests. Run Jest judge suites.
- [ ] Data model/authoring: migrate Checker.protocol with LEGACY database default. New SPJ API defaults BOOLEAN_STDOUT; updates preserve existing protocol absent explicit change. Clone current version plus checker/cases/groups inside transaction with per-problem advisory lock for checker/test-data changes. File upload stores decoded source rather than object path. Add tests for clone/atomic replacement/protocol validation and upload. Regenerate Prisma and run tests.
- [ ] Frontend: selectors on create/edit, correct source templates and explanations; preserve legacy when editing existing records. Add UI tests and build.
- [ ] Independent review: spec then quality review. Address critical/important findings before release.
- [ ] Deploy: back up images/source, additive migration, update worker and API coherently (pause admission/queue only if needed, resume reliably). Preserve all existing resource limits. Push 42411036, no main push.
- [ ] Verify live: serial isolated diagnostics, normal languages/statuses, SPJ protocols/faults, pinned version and authoring updates; clean fixtures, confirm healthy worker/queue. Record exact results and limitations.
