# Submission toolbar and test filenames

**Goal:** Right-align the personal-submission filter with equal vertical spacing, and import numeric-suffix testcase filenames.

**Design:** Keep the existing standalone filter row but make it a right-aligned toolbar, with 16px above/below the button and no extra header bottom margin on this page. Pair ZIP entries by complete basename (without extension), not just suffix, to prevent crossed answers. Accept positive safe integer suffixes, sort numerically then by basename; reject duplicate input/output per basename, preserve existing ZIP safety checks, standard answer requirements and SPJ input-only handling. Update both authoring pages' instructions. No homepage/worker changes.

**Execution:** Follow test-driven-development and executing-plans inline. User standing instruction authorizes proceeding without additional approval prompts.

- [ ] Add backend ZIP cases for prefixed names, numeric order, SPJ, different prefixes, duplicates, missing answers; run Jest and observe failures.
- [ ] Add browser geometry assertions for right edge and equal 16px gaps on desktop/mobile; run against current UI and observe failure.
- [ ] Update `problem.service.ts` parser and create/edit instructions, `ContestSubmissions.vue` toolbar and page-scoped CSS; rerun tests.
- [ ] Run backend/frontend suites and builds; browser screenshots/geometry; push `42411036`, deploy API/frontend only, verify real ZIP import with isolated fixtures and site health.
