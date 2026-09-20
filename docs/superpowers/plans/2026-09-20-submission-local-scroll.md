# Submission record local scrolling

**Goal:** Problem and contest submission lists scroll internally instead of growing the whole page.

**Design:** Limit only the two record containers using viewport-relative max-height (problem min(420px,50dvh), contest min(520px,55dvh)), native overflow:auto and overscroll-behavior:contain. Keep title, refresh and mine filter outside; sticky contest table header. Add named keyboard-focusable regions. Do not lock document/body scrolling, alter statement/editor, or change backend APIs.

**Execution:** Inline test-driven implementation in existing isolated worktree; standing user instruction authorizes no repeated approval prompts.

- [ ] Add Playwright regression with many records, desktop/mobile/short viewport: bounded region, actual wheel changes inner scroll but not document, edge containment, sticky table header, details open, few records shrink.
- [ ] Run on previous deployed UI to observe failure, add scoped container styles and accessibility attributes, rerun on local production build.
- [ ] Run frontend tests/typecheck/build and existing contest/editor/submission regressions; inspect screenshots, review diff.
- [ ] Push `42411036`, deploy frontend only with preserved tunnel configuration, run regression on deployed assets and check API/worker health.
