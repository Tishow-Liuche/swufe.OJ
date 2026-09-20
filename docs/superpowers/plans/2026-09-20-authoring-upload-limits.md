# Authoring upload limits

Root cause: production JSON parser rejected an 884738-byte authoring request at its default 102400-byte limit. This is distinct from ZIP ratio and judge runtime memory.

Scope: authoring create/edit JSON 16 MiB; other JSON and URL-encoded bodies 100 KiB. ZIP entry 64 MiB, archive 50 MiB, total extracted 100 MiB, 200 entries. Keep CRC, bounded inflation and authentication unchanged. Auto-fill samples only when the first input/output pair totals at most 64 KiB; retain manually entered samples.

Sequence: reproduce with HTTP/parser and ZIP unit tests; implement narrowly scoped parsers and sample guard; run full backend tests/build; independent review; deploy backend-only derived image with health-check rollback; verify authenticated public HTTP create/edit/import using owned disposable fixtures; push student branch 42411036.

Operational constraint: main backend has 512 MiB memory. These are bounded limits, not an unlimited dataset promise. Larger aggregate datasets need streaming/object storage rather than removing decompression budgets. No worker, database, proxy, frontend or judge memory configuration changes.

## Verification and release

- Regression tests first reproduced 413 on 1 MiB authoring and rejection of 12 MiB test input under the old limits.
- HTTP parser tests cover create/edit, exact 16 MiB boundary, over-limit Chinese 413, ordinary API limits, URL-encoded limits, malformed JSON and multipart passthrough.
- ZIP tests cover 12 MiB contents, no oversized auto samples, 64 MiB declared boundary, malformed archives and unchanged aggregate budgets.
- Authenticated live audit passed both locally inside the deployed backend and through https://test.singularitylab.online: 1 MiB create/edit, real 12 MiB input import, >16 MiB rejection, STANDARD/SPJ high-ratio imports and corrupt ZIP rejection. Owned fixtures removed. The configured 64 MiB single-entry ceiling was not load-tested on production.
- Public audit used Node flags `--dns-result-order=ipv4first --no-network-family-autoselection` after default container fetch failed; TLS verification remained enabled.
- Deployed image `swufe-oj:upload-limits-20260920`; rollback `swufe-oj:before-upload-limits-20260920`. Backend-only restart; proxy start timestamp unchanged. Queue unpaused, zero active/waiting/failed, one worker connected. Backend after audit approximately 102 MiB / 512 MiB.
