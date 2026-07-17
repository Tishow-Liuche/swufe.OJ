# Security Hardening Design

**Status:** Approved design pending implementation planning

**Scope:** Close the deployment, session, authorization, rendering, password-change, upload, and baseline HTTP-security gaps identified in the 2026-07-17 security audit. This design intentionally does not restart containers or rotate live credentials; it prepares the repository for a controlled rollout.

## Goals

- Make infrastructure services private by default and require non-default secrets at deployment time.
- Keep refresh tokens out of JavaScript-accessible storage and enforce mandatory password changes on the server.
- Enforce problem ownership and explicit delegated permissions for all mutation and test-data operations.
- Prevent untrusted problem statements from executing in the browser.
- Add practical abuse limits and bounded ZIP processing without changing normal OJ workflows.

## Non-goals

- This phase does not redesign the remote-helper protocol, the native judge, or the existing public API catalogue.
- This phase does not mutate the currently running database, restart Docker containers, or rotate credentials.
- This phase does not infer historical problem ownership from unreliable data.

## Deployment Boundary

`docker-compose.yml` will bind PostgreSQL, Redis, MinIO API, MinIO Console, and go-judge only to `127.0.0.1` for the current host-based backend deployment. The compose file will consume required variables from a dedicated, ignored infrastructure environment file and fail fast when a secret is absent.

Redis will require a password and retain protected mode. The backend BullMQ connection will read that password from configuration. PostgreSQL and MinIO will no longer contain committed development credentials; the example configuration will use placeholders and the deployment documentation will describe the coordinated credential rotation required before restart.

## Authentication and Session Boundary

The API will issue access tokens in the JSON response only and place refresh tokens in an `HttpOnly`, `SameSite=Lax` cookie. The frontend will retain the access token in memory only; it will not write either token to local or session storage. Refresh and logout requests will use credentials-enabled same-origin requests, and the backend will read, rotate, or clear the cookie.

Production cookies will be `Secure`; local HTTP development remains explicitly supported through an environment-sensitive cookie option. Refresh tokens remain high-entropy, but database persistence will store only a hash so a database read cannot be replayed as a session.

The authenticated principal will include `mustChangePassword`. A dedicated server-side guard will reject authenticated requests for such users except the small allowlist needed to inspect the account, change the password, refresh/logout, and load static assets. Frontend routing remains a usability aid, not the enforcement point.

## Problem Authorization Boundary

`Problem` will gain a nullable `createdById` relation to `User`. New local and imported problems will have an explicit owner. A centralized problem-access policy will make the following decisions:

- Administrators retain full access.
- A problem owner can edit metadata, versions, test data, checker files, and publication state.
- A delegated `ProblemPermission` grants only the named operation; no implicit teacher-wide access exists.
- A legacy problem with no owner is fail-closed: only an administrator can manage it until ownership is explicitly assigned.

Every mutation endpoint (`update`, `delete`, `status`, test-data upload, checker upload, image upload where relevant) will pass the caller identity into this policy. Read-only public problem endpoints remain limited to published data. A migration will add the nullable owner column without guessing owners; existing rows therefore become administrator-managed legacy content.

## Rendering and Input Boundary

Problem statements will be sanitized at two layers:

1. Server-side import and write paths will retain only an allowlisted subset of rich-text HTML needed for statements.
2. The frontend will render Markdown, then sanitize the generated HTML with DOMPurify before assigning it to `v-html`.

This blocks scripts, event handlers, unsafe URLs, embedded active content, and dangerous SVG payloads while preserving code blocks, tables, links, mathematical output, and safe formatting.

Test-data ZIP handling will set explicit limits for entry count, per-entry uncompressed size, aggregate uncompressed size, and compression ratio before reading entry data. Paths remain normalized and traversal is rejected. Upload handlers will fail with a clear 400 response when any safety budget is exceeded.

## HTTP Baseline and Abuse Controls

The backend will install Helmet with a CSP compatible with the current SPA and KaTeX assets, plus `nosniff`, frame protection, referrer policy, and production HSTS. Login, registration, refresh, and password-change endpoints will use tighter rate limits; general API endpoints receive a broader per-client limit. The proxy/trust configuration will be documented so client IP limits are meaningful behind a reverse proxy.

## Migration and Rollout

1. Deploy code and schema changes without restarting the current infrastructure.
2. Generate and store replacement infrastructure secrets in the ignored deployment environment file.
3. Coordinate PostgreSQL, Redis, MinIO, application, and browser-session restart/rotation in one maintenance window.
4. Assign owners for historical problems through an administrator-only operation before returning teacher editing access.
5. Revoke existing refresh sessions during rollout because the token storage format changes.

## Verification

- Unit tests cover owner, delegate, administrator, and legacy-problem access decisions.
- Endpoint tests prove forced-password users cannot access normal APIs.
- Auth tests verify no refresh token appears in JSON and cookie rotation works.
- Rendering tests prove representative script, event-handler, and `javascript:` payloads are removed.
- ZIP tests cover normal archives, traversal, excessive entry count, excessive expansion, and invalid headers.
- Compose/config checks confirm all infrastructure ports bind to loopback and required secrets have no defaults.
- Existing backend and frontend type checks, Prisma validation, migration status, and the full test suite are run before handoff.
