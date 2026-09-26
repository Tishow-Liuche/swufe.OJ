# Shared authored problems implementation plan

**Approved scope:** Teachers and administrators share LOCAL authored problem history, editing, checker/test-data maintenance and author preview. Preserve authorship, ownership-based publication/deletion/delegation, and student isolation. No data copies or ownership migration.

**Architecture:** Keep route role guards. Remove owner filtering only for staff history. In ProblemAccessService grant TEACHER access only to LOCAL EDIT/MANAGE_TESTDATA/MANAGE_CHECKER. Continue existing checks for all other actions. EditProblem should only request a publication transition when status actually changed.

**Tech stack:** NestJS/Prisma, Vue, Jest/Vitest.

- [ ] Add permission tests for owned/unowned LOCAL problems, imported problems and students. Update staff history assertions; run Jest to confirm failure.
- [ ] Implement scoped policy and list filter changes. Preserve original createdById.
- [ ] Test unchanged-status save issues no publication request; keep explicitly changed status using guarded publication endpoint.
- [ ] Run backend problem tests, frontend tests and both builds. Review diff for unintended privilege expansion.
- [ ] Commit/push user branch without rewriting main; publish only verified scoped changes, preserving existing unrelated deployment work.

Previously diagnosed bulk-test-data memory and empty-form issues are not resolved by this permission change and must not be reported as fixed by it.
