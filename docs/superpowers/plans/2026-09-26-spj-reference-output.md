# SPJ optional reference output implementation plan

Approved design: SPJ reference output is optional, not forbidden. Preserve supplied .out/.ans and inline expectedOutput, pass unchanged to the existing checker output file. Do not invent missing historical answers or change checker verdict semantics.

1. Add failing tests in authoring-memory.spec.ts for optional outputs, small .out/.ans, streamed large output and inline normalization; retain corrupt-output rejection.
2. In problem.service.ts remove discarded SPJ output validation path; retain outputEntry, decode it when present, include its size in stream threshold, and preserve inline expectedOutput. No schema/judge-worker change.
3. Clarify CreateProblem.vue/EditProblem.vue: upload reference outputs when checker needs them; missing reference is empty output file.
4. Run backend authoring and judge suites, frontend tests/build and backend build. Review changes independently.
5. Read-only inspect historical versions and available local archives for the affected problem. Restore only demonstrably matching data via a new version; otherwise report reupload requirement.
6. Push 42411036 without touching main. Deploy only changed API module and frontend assets with backup; verify health and hashes.

Verification: five new regression tests observed failing on four preservation paths, then passed after fix. Frontend 88 tests and both builds passed. Independent review approved. Isolated SPJ probe with 64 MiB input + 32 MiB reference output passed exact archive/DB MD5 checks, three version copies, reupload and corrupt-CRC rollback under 512 MiB container limit; peak process RSS127 MiB. Probe filename matching targets controlled numbered fixtures, not arbitrary archives.

Recovery audit: affected problem cmui0ibfc089a1g1mehdq38dk has six historical versions, all with zero official-output bytes. Existing local test-data/download archives did not match the problem. No production test data or checker was changed; original reference outputs must be reuploaded. Existing failed submissions retain their version snapshot; use a fresh verification submission after reimport.
