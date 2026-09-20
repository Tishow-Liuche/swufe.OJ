# Editor recovery verification — 2026-09-20

Runtime commit: `33025d92e843db4191d8e96933dc89c8215d1375`.

- Save code and language synchronously in browser storage, isolated by account, problem and contest/practice/preview context. Empty drafts are preserved. Browser storage clearing or another device does not preserve these local drafts.
- Remount problem views when their route/context changes; snapshot draft destination to avoid writing contest drafts into practice during navigation.
- Enable Tab/Shift+Tab indentation; add accessible return-to-contest link.
- Remove polling-exhaustion banner without changing submission verdicts.
- Homepage and worker configuration unchanged.

Verification:

- Reproduced refresh data loss in the old build before the fix.
- Frontend: 51 tests passed; TypeScript and production build passed.
- Browser: immediate refresh, language recovery, contest isolation through SPA navigation, Tab/Shift+Tab, return link and banner absence passed.
- Regression scripts: multiple submissions, contest hint visibility and four-page contest arena passed.
- Deployed frontend-only Caddy image to test.singularitylab.online. Real temporary account and contest verified refresh recovery, indentation, language and return navigation on the live website.
- Temporary fixtures removed. Worker check: 1 worker; waiting/active/failed/paused all 0.

Browser regression: `packages/frontend/scripts/check-editor-recovery.mjs` (UI_BASE_URL and PLAYWRIGHT_MODULE supported).
