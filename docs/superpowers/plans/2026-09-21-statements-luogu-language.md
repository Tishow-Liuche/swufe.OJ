# CF statement completion and Luogu language repair

**Goal:** Fill verified missing CF statements without changing audited difficulty; prevent C++ tasks from being submitted as C.

**Architecture:** Preserve the 10,024 existing statements and collect only the 950 placeholders. Prefer official CF statements, otherwise explicitly identify a public Luogu mirror; reject challenge/login/error responses. Back up affected versions before atomic old-value-checked updates. No bypass of source access controls. Luogu helper selects a real language option, checks the selected language again before submit, and reports a blocked form instead of guessing.

**Tech Stack:** Node, Prisma/PostgreSQL, browser userscript, Playwright.

- [x] Probe original and public mirror access; collect missing statement identities and actual statement evidence with bounded request pacing. Record unavailable rows, never fabricate statements.
- [x] Validate parser with fixtures containing formulas, samples and failure pages; preserve title/ID/difficulty and existing real statements in importer. Test rejection before writing and idempotency.
- [x] Back up and apply verified statement changes, independently verify counts/content and actual browser rendering.
- [x] Reproduce Luogu C++/C selection failure with executable DOM tests. Replace whole-page text matching with scoped options, distinguish C/C++, verify selection and gate submission. Bump helper and installer version together.
- [x] Review changes, run regression tests, deploy helper without restarting Caddy, verify public downloaded bytes and installer URL. Backend report-blocked route was missing; added and tested with exact token/lease checks and transactional terminal protection.
- [ ] Commit remaining evidence/tools/report and push student branch; report Git transport failure if unavailable.

Result: 925 statements filled; 25 public-source failures explicitly remain. All original statements, difficulty and IDs preserved. Backend 53 suites/469 tests and build, frontend 25 suites/73 tests, 13 browser language tests, 6 statement tests, two isolated PostgreSQL integrations and live-page checks passed. See deployment report for unavailable IDs and recovery details.

User has requested autonomous execution and no additional approval prompts. Continue in the existing isolated worktree; preserve unrelated main-checkout edits. CF collection is processed first; independent language implementation may prepare in parallel, followed by review and release.
