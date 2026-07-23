# OJ Helper One-Click Install Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide a clearly named one-click installation and verification flow for SWUFE Singularity OJ's Codeforces, Luogu, and QOJ auto-submit helpers.

**Architecture:** Keep the existing three Tampermonkey helper scripts as the runtime source of truth, add one unified public installation page, add one PowerShell launcher for teammates/server operators, and add one Node verification script that rejects helper regressions such as "jump only, no code fill, no submit click, no result callback."

**Tech Stack:** Static HTML in `packages/frontend/public`, Tampermonkey userscripts, Node.js validation script, npm scripts, PowerShell launcher.

---

### Task 1: Add regression verification for the three helpers

**Files:**
- Create: `packages/frontend/scripts/check-oj-helper-installer.mjs`
- Modify: `packages/frontend/package.json`

- [ ] **Step 1: Write the failing installer/helper verification script**

Create `packages/frontend/scripts/check-oj-helper-installer.mjs` that checks the installer page and the three `.user.js` files.

- [ ] **Step 2: Run it before implementation**

Run: `npm run test:oj-helpers`

Expected: FAIL because the npm script or unified install page does not exist yet.

- [ ] **Step 3: Add npm script**

Add `"test:oj-helpers": "node scripts/check-oj-helper-installer.mjs"` to `packages/frontend/package.json`.

- [ ] **Step 4: Keep it failing until install page and metadata are fixed**

Run: `npm run test:oj-helpers`

Expected: FAIL with missing unified install page or metadata checks.

### Task 2: Add unified public install page

**Files:**
- Create: `packages/frontend/public/install-oj-helpers.html`

- [ ] **Step 1: Add a UTF-8 static page**

The page must clearly say `SWUFE Singularity OJ One-Click Installer`, list CF/Luogu/QOJ, and provide direct install buttons for:

- `/cf-helper.user.js`
- `/luogu-helper.user.js`
- `/qoj-helper.user.js`

- [ ] **Step 2: Add one-click open-all action**

The page must provide a button that opens all three helper install URLs so Tampermonkey can prompt installation/update for each script.

### Task 3: Add server/local PowerShell one-click launcher

**Files:**
- Create: `extension/install-swufe-oj-helpers.ps1`

- [ ] **Step 1: Add script with clear name marker**

The script must print `SWUFE Singularity OJ auto-submit helper one-click installer`, accept optional `-BaseUrl`, verify the three userscript files in the repo, and open the unified install page plus the three direct userscript URLs.

- [ ] **Step 2: Make local and server use clear**

Default `BaseUrl` should be `http://127.0.0.1:5173`, but the script must support server usage:

```powershell
powershell -ExecutionPolicy Bypass -File .\extension\install-swufe-oj-helpers.ps1 -BaseUrl "https://your-server-domain"
```

### Task 4: Fix helper metadata and install page encoding risks

**Files:**
- Modify: `packages/frontend/public/cf-helper.user.js`
- Modify: `packages/frontend/public/luogu-helper.user.js`
- Modify: `packages/frontend/public/qoj-helper.user.js`
- Modify: `packages/frontend/public/install-cf-helper.html`
- Modify: `packages/frontend/public/install-luogu-helper.html`
- Modify: `packages/frontend/public/install-qoj-helper.html`

- [ ] **Step 1: Rename helper scripts**

Use stable names:

- `SWUFE Singularity OJ - Codeforces Auto Submit Helper`
- `SWUFE Singularity OJ - Luogu Auto Submit Helper`
- `SWUFE Singularity OJ - QOJ Auto Submit Helper`

- [ ] **Step 2: Remove localhost-only metadata**

Do not keep `@downloadURL http://localhost:5173/...` or `@updateURL http://localhost:5173/...` because teammates install from server URLs.

- [ ] **Step 3: Replace mojibake-prone visible text**

Use English metadata and clean UTF-8 install pages so browsers do not show garbled script banners or installation instructions.

### Task 5: Verify, commit, and push

**Files:**
- All files changed above.

- [ ] **Step 1: Run targeted checks**

Run:

```powershell
cd packages/frontend
npm run test:cf-helper
npm run test:luogu-helper
npm run test:oj-helpers
```

Expected: all pass.

- [ ] **Step 2: Inspect git diff**

Run: `git diff --stat` and `git diff --check`.

- [ ] **Step 3: Commit intended files**

Commit message: `add swufe oj helper one-click installer`

- [ ] **Step 4: Push current branch**

Run: `git push origin 42411036`.
