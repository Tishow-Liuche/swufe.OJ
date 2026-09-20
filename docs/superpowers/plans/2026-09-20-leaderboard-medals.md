# Leaderboard text and medals

**Goal:** Remove ranking-rule copy and restore restrained gold/silver/bronze medals for ranks 1–3. Preserve homepage, sorting, API requests, values and score breakdown.

**Design:** Keep existing blue page style. Remove hero explanation and switch-card subtitles; reduce their now-unused height. Use small CSS-drawn circular medals with numeric ranks and short ribbons (no emoji/image requests), one metal palette per rank. Keep rank 4+ plain. Add accessible medal/rank labels; retain local mobile table scrolling.

**Execution:** Inline in existing isolated worktree, following standing user instruction to proceed without repeated confirmation.

- [x] Add mounted Vue tests for GLOBAL/OVERALL/CONTEST: no rule text, ranks 1–3 medals, rank 4+ plain, scores preserved; run red.
- [x] Update only Leaderboard.vue scoped markup/styles. Run frontend tests, leaderboard script and production build.
- [x] Inspect desktop/mobile browser layouts and medal alignment; deploy frontend assets atomically without restarting proxy/worker, verify deployed assets and health.

## Verification

55 frontend tests and leaderboard frame check pass. Typecheck and production build pass using a fresh output directory (previous dist contained a locked file). Six browser scenarios (three scopes × 1440/390px) pass locally and on deployed assets; API fixture responses are mocked, numeric medal labels/colors and ribbon bounds are asserted. Desktop/mobile screenshots inspected. Independent review found no blockers. Homepage and backend logic unchanged.

Frontend release `eb6bf31` deployed to existing Caddy container by hashed-assets copy then atomic index replacement. Caddy start timestamp remains `2026-09-20T10:03:14.97459625Z`; backend health OK, queue unpaused, worker connected. Rollback image `swufe-oj-caddy:before-medals-20260920`, prior index `/home/ubuntu/leaderboard-medals-20260920/index.before.html`. Persistent latest image updated without restarting services. GitHub synchronization is tracked by the git push result, separately from successful deployment.
