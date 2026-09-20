# Leaderboard text and medals

**Goal:** Remove ranking-rule copy and restore restrained gold/silver/bronze medals for ranks 1–3. Preserve homepage, sorting, API requests, values and score breakdown.

**Design:** Keep existing blue page style. Remove hero explanation and switch-card subtitles; reduce their now-unused height. Use small CSS-drawn circular medals with numeric ranks and short ribbons (no emoji/image requests), one metal palette per rank. Keep rank 4+ plain. Add accessible medal/rank labels; retain local mobile table scrolling.

**Execution:** Inline in existing isolated worktree, following standing user instruction to proceed without repeated confirmation.

- [ ] Add mounted Vue tests for GLOBAL/OVERALL/CONTEST: no rule text, ranks 1–3 medals, rank 4+ plain, scores preserved; run red.
- [ ] Update only Leaderboard.vue scoped markup/styles. Run frontend tests, leaderboard script and production build.
- [ ] Inspect desktop/mobile browser layouts and medal alignment. Push 42411036, deploy frontend assets atomically without restarting the proxy/worker, verify deployed assets and health.
