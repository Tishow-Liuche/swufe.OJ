# History loading and delivery plan

Goal: restore reliable history loading before changing frontend delivery. Preserve existing data, permission checks, editor content and homepage appearance.

Evidence: history currently returns 1,593,401 bytes for 13 items, including unused descriptions, samples and checker source. Backend query took 124 ms; public authenticated request took 3296 ms in one sample. Frontend times out at 10000 ms. No deterministic server exception reproduced yet; do not claim every failure is proved to be timeout.

History approach: exclude unused large fields at the Prisma select, retaining checker.type and test case count. Do not merely extend the timeout or delete samples. Test the query projection and existing ownership filters, then compare real authenticated responses and verify browser list rendering. Backend-only patch with rollback.

Delivery approach after history: compare direct-origin HTTPS with public proxy using certificate validation. Only change a DNS/CDN setting with existing authorized credentials and verified safe route; no insecure TLS bypass, hardcoded browser IP, domain switch or removal of security protection. If CDN account control is unavailable, report the blocker. Independently reduce measured icon request fragmentation via a bounded shared icon bundle, validate production build and homepage appearance before deploy.

Steps: add failing projection assertion in problem.service.spec.ts; narrow findAuthored selection in problem.service.ts; run backend tests/build; authenticated live audit; deploy and repeat audit. Then inspect delivery credentials/config, test icon chunk grouping, frontend tests/build/browser verification, deploy static files without restarting proxy. Push 42411036 without force.

## Results

- History response reduced from 1,593,401 to 6,003 bytes for the same 13 existing problems. Live HTTP 200 both internally (68 ms) and publicly (2139 ms in sampled request). Disposable administrator browser test rendered all 13 entries with no page errors. Existing content unchanged, fixture removed.
- Backend 50 suites / 417 tests passed; frontend 21 suites / 56 tests passed. Both builds passed. Existing frontend dist had a locked favicon; generated release in a new isolated temporary output directory without deleting the old one.
- Browser comparison before/after grouped icons: homepage JS requests 11 → 3, same text and 17 SVG icons, no horizontal overflow or page errors. CSS and homepage component unchanged. Independent code review found no important issue.
- Backend image `swufe-oj:history-loading-20260920`, rollback `swufe-oj:before-history-loading-20260920`; frontend image `swufe-oj-caddy:delivery-20260920`, rollback `swufe-oj-caddy:before-delivery-20260920`. Static assets copied before atomic HTML switch; old hashed assets retained. Proxy start time unchanged, judge queue empty with one connected worker.
- Direct-origin HTTPS using the existing domain and validated certificate measured 0.36 s from this client. DNS/CDN routing has NOT been changed: no Cloudflare management configuration found in scoped local environment or deployed proxy/infra/app config. Actual routing optimization requires domain/CDN account access; frontend bundle optimization is not a claim that overseas routing is fixed.
