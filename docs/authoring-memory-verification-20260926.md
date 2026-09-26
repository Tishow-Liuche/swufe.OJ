# Authoring memory regression verification (2026-09-26)

## Incident and change

The 512 MiB API container was OOM-killed during test ZIP replacement, producing proxy EOF/502 and subsequent connection refusal. Editor detail and version cloning also materialized all test bodies.

Editor queries now return case identifiers only. Unchanged cases are copied within PostgreSQL; ZIP replacements are decoded incrementally and assembled through transaction-local SQL chunks. Historical versions remain immutable. Invalid archives roll back the new version. Disk-backed uploads admit one import per API process; concurrent imports receive 429 instead of buffering an unbounded queue. Failed editor loads show retry and cannot save empty forms.

## Verification

- Separate container with `--memory=512m --memory-swap=512m`, using an isolated temporary PostgreSQL schema, never production problem rows.
- 48 MiB expanded / 12 test cases: import, three edits, reupload, corrupt-CRC rollback; peak sampled API-process RSS 124 MiB; editor JSON 1385 bytes.
- 96 MiB expanded / one 64 MiB input plus 32 MiB output: same workflow; peak sampled API-process RSS 126 MiB; editor JSON 879 bytes. Repeated after review corrections with the same result.
- MD5 signatures and byte counts checked in PostgreSQL after every version copy and replacement. Original imported version signatures remained unchanged.
- Corrupt replacement did not create a version or change the current version.
- Targeted backend regression suites: 90 tests passed. Frontend: 31 suites / 88 tests passed. Backend and frontend production builds passed.
- Independent code review approved after fixing validation of discarded SPJ outputs and testing large inline replacements.

Run `packages/backend/scripts/test-authoring-memory.cjs` only with an authorized test/isolated-schema database, `MEMORY_FIXTURE` ZIP path, and optional `CORRUPT_FIXTURE`. It creates and drops only a uniquely named probe schema.

## Limits and scope

Existing archive limits remain 50 MiB compressed, 64 MiB per entry, 100 MiB total expansion and 200 file entries. Upload transaction timeout is 120 seconds. This is not an unlimited-size or arbitrary-concurrency guarantee. RSS figures describe the isolated API process, not database memory or total server usage. SQL version copies still consume database storage; no historical versions were deleted. Import admission is process-local and must be reconsidered if API replicas are added.
