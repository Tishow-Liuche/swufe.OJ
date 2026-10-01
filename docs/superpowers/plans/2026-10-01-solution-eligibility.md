# Solution eligibility repair

Goal: accepted users can write solutions without modifying verdicts or broadening contest UI visibility.

Confirmed root cause: Vue casts the omitted optional Boolean `solved` prop to false. The component returns before fetching status. Additional defects: learning-state endpoint requires publication; external synced AC is omitted by community gate; submission updates do not refresh the component.

Design: remove the optional Boolean shortcut. Add JWT-protected community eligibility GET returning only the current user's permission, sharing the exact local-or-linked-external AC predicate with publishing and reading. Preserve moderator bypass and existing contest hint hiding. Use result revision, identity and visibility changes to refresh; sequence requests and distinguish failed lookups from unsolved status.

Plan/checkpoints:
- [x] Reproduce local/external eligibility and UI false rejection in Jest/Vitest before production edits.
- [x] Update community service/controller, ProblemDiscussionPanel and ProblemDetail result invalidation.
- [ ] Run community/learning/contest tests, full frontend suite, Nest and frontend builds.
- [ ] Independent review, fix important findings.
- [ ] Check production release and idle contests/queue, save rollback files/images.
- [ ] Deploy compiled community modules and frontend assets; retain prior hashed assets.
- [ ] Read-only authenticated HTTP checks using real AC records; anonymous endpoint must reject. Verify published entry and health. No real solution posts or user data mutations during checks.

No schema migration or judge-worker changes. Rollback restores saved community modules, frontend index and prior image tags if verification fails.
