# Large OJ data assets

This directory stores large OJ data files as small Git-friendly parts.

Run the restore script from the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File data/large-assets/restore-large-assets.ps1
```

It restores:

- `luogu_full.ndjson.gz`
- `packages/backend/prisma/problem-bank.snapshot.json.gz`

The restore script verifies SHA-256 hashes from `manifest.json`.
