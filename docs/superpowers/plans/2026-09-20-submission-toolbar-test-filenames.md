# Submission toolbar and test filenames

**Goal:** Right-align the personal-submission filter with equal vertical spacing, and import numeric-suffix testcase filenames.

**Design:** Keep the existing standalone filter row but make it a right-aligned toolbar, with 16px above/below the button and no extra header bottom margin on this page. Pair ZIP entries by complete basename (without extension), not just suffix, to prevent crossed answers. Accept positive safe integer suffixes, sort numerically then by basename; reject duplicate input/output per basename, preserve existing ZIP safety checks, standard answer requirements and SPJ input-only handling. Update both authoring pages' instructions. No homepage/worker changes.

**Execution:** Follow test-driven-development and executing-plans inline. User standing instruction authorizes proceeding without additional approval prompts.

- [x] Add backend ZIP cases for prefixed names, numeric order, SPJ, different prefixes, duplicates, missing answers; run Jest and observe failures.
- [x] Add browser geometry assertions for right edge and equal 16px gaps on desktop/mobile; run against current UI and observe failure.
- [x] Update `problem.service.ts` parser and create/edit instructions, `ContestSubmissions.vue` toolbar and page-scoped CSS; rerun tests.
- [x] Run backend/frontend suites and builds; browser screenshots/geometry; push `42411036`, deploy API/frontend only, verify real ZIP import with isolated fixtures and site health.

## Verification

- Backend 387/387, frontend 52/52; backend build, frontend typecheck/build pass.
- Browser regression against deployed assets at desktop 1440px and mobile 390px: right edges agree within 2px, top/bottom gaps each 16px; filter still toggles only own submissions; screenshots reviewed.
- Real PostgreSQL import through deployed ProblemService: prefixed + legacy + .ans pairing, numerical order, SPJ input-only succeed; mismatched/duplicate files reject without changing current data. Isolated fixtures removed. This service smoke does not test authentication.
- Runtime code: `47bd75db080a59cfbf345a4bc8d024708470e212`; pushed `42411036`. API/frontend deployed, worker unchanged. Site healthy, queue resumed with one worker and zero waiting/active/failed jobs.
- Full basenames must agree: `01.in` + `1.out` are not paired; this intentionally avoids guessing when filenames differ.
