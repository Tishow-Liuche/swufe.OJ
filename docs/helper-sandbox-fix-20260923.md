# Helper installation and presence fix (2026-09-23)

## Root causes

- In a real Tampermonkey sandbox, MessageEvent.source equals document.defaultView but not the wrapped window. The old source check discarded valid same-origin installation pings. All three helpers now validate document.defaultView, origin, platform and request ID.
- Timed window.open calls cannot reliably open three installation dialogs. The primary installer link now installs one generated bundle with all three platform implementations. Standalone update links remain available.
- Bundle users share GM storage, so API-base keys are now isolated per platform.

## Upgrade

Existing users must update their browser-installed scripts: CF 7.7, Luogu 1.10, QOJ 2.7. Alternatively disable all three standalone helpers and install All Platforms Helper 1.0. Do not enable both variants simultaneously. Refresh the OJ after installation. Browser extension user-script and site permissions must be enabled by the user.

## Verification

- Real Tampermonkey extension in isolated Chromium profiles: standalone and bundled variants each respond for all three platforms.
- Real installer-link test: one click opens a Tampermonkey confirmation; after installation all three platforms report ready.
- Bundle tests: direct installation, generated-source consistency, host dispatch, independent API storage (4 tests).
- Frontend unit regression: 26 suites, 77 tests passed.
- No user cookies or browser profile data were read; no live external submissions were made.

## Deployment scope

Frontend assets, installer and userscripts only. Incremental publication to the existing Caddy container and a persistent replacement image; no Caddy restart, backend changes, database changes or judge-host changes. Previous public files and server source are backed up under /home/ubuntu/helper-sandbox-20260923.
