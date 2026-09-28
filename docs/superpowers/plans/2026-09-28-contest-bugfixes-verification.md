# Contest fixes deployment verification

Runtime commit: `6668a9b2a562855307cf8765720585caa3157567`, pushed to `42411036` only.

All implementation items in the accompanying plan completed. Earlier admin student-ID display commit `98623c5` was deployed first.

- Regression verification: backend 67 suites / 640 tests; frontend 37 suites / 124 tests; both production builds passed. Independent specification and quality reviews approved after fixes.
- Isolated real API integration: student-ID/nickname import, unregistered teacher standings/submissions with problem filter, 100,000-line submission persistence, refresh rotation and rejection of replayed old token passed. Temporary containers and database schema removed afterward.
- Main API/frontend deployed with rollback backups. HTTPS health returned OK; deployed index and selected auth/contest/judge runtime SHA256 hashes match local artifacts.
- Teacher worker updated after draining active jobs; existing resource limits and sandbox preserved. Post-deployment real sandbox results: normal AC (21ms), CPU loop TLE (1101ms), infinite output MLE (179ms), 100,000-line C++ compilation passed. Queue resumed, zero active/waiting jobs at verification.
- Source policy is 4 MiB UTF-8, not unlimited lines; submission JSON envelope allows escaped source. Other request limits remain scoped.
- First non-AC stops subsequent testcase execution. Output-collection evidence preserves actual resource verdict rather than forcing TLE or SYSTEM_ERROR.
- Final-minute LaoLiTou submission logs show database connection/pool errors, followed by automatic retry and final TLE. Historical results were not rewritten. The underlying intermittent network/database-path failure was not conclusively established; transient persistence errors now retry without exposing premature terminal SYSTEM_ERROR.
- Transient session errors no longer clear authentication. Genuine revoked/expired authentication still requires login; uninterrupted login under all circumstances is not promised.

Deployment does not change main, database schema, production accounts, sandbox capacity, or historical submission results.
