# Submission record local scrolling

**Goal:** Problem and contest submission lists scroll internally instead of growing the whole page.

**Design:** Limit only the two record containers using viewport-relative max-height (problem min(420px,50dvh), contest min(520px,55dvh)), native overflow:auto and overscroll-behavior:contain. Keep title, refresh and mine filter outside; sticky contest table header. Add named keyboard-focusable regions. Do not lock document/body scrolling, alter statement/editor, or change backend APIs.

**Execution:** Inline test-driven implementation in existing isolated worktree; standing user instruction authorizes no repeated approval prompts.

- [x] Add Playwright regression with many records, desktop/mobile/short viewport: bounded region, actual wheel changes inner scroll but not document, edge containment, sticky table header, details open, few records shrink.
- [x] Run on previous deployed UI to observe failure, add scoped container styles and accessibility attributes, rerun on local production build.
- [x] Run frontend tests/typecheck/build and existing contest/editor/submission regressions; inspect screenshots, review diff.
- [x] Push `42411036`, deploy frontend only with preserved tunnel configuration, run regression on deployed assets and check API/worker health.

## Verification

- Both old deployed containers failed the new overflow assertion before implementation.
- Frontend 52/52 tests, typecheck and production build pass. Six browser scenarios pass locally and against deployed assets (problem/contest × 1440x1000,390x844,1280x600); checks cover 80-row/2-row layouts, native wheel, upper/lower overscroll containment, keyboard access, sticky table header and source details. API responses in these browser regressions are mocked.
- Existing contest navigation/filter/layout, editor recovery/Tab and multiple-submission regressions also pass. Screenshots inspected.
- Frontend code release `fd5fbb321a114dd7ed96b39370155e44553de4c2` pushed to `42411036`. Built new Caddy image, copied hashed assets first and atomically switched index.html in the running container, retaining old assets/index for rollback. No backend, worker or proxy restart; in-flight evaluations continued. API healthy, queue unpaused and one worker connected.
