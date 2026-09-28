# Contest reliability fixes

Goal: deploy pending admin student-ID display, then fix eight reported contest issues with regression coverage and evidence-based verdicts.

Use systematic debugging, TDD, independent domain agents, final review and verification. User explicitly authorizes autonomous implementation and deployment; push only 42411036, never main. Existing isolated worktree remains the development workspace. No production submission rejudge or account alteration without necessity/explicit scope.

- [ ] Deploy already tested 98623c5 (admin identity display), backup frontend index/backend user service, verify health and selected studentId without exposing values.
- [ ] Participant import resolves username/nickname/studentId safely; reject ambiguous identities. Retain campus real-name validation. Test each input and mismatches.
- [ ] Teachers/admins may read campus-private submissions/standings without registration; do not grant submit/edit rights. Add combined problem/mine/name filtering with tests.
- [ ] Diagnose source-code length and request-body constraints, replace inconsistent limits with a bounded UTF-8 byte policy and user-visible error; test large/over-limit payloads. Do not confuse source bytes with runtime memory.
- [ ] Map sandbox time/output limits correctly, preserve genuine infrastructure errors, and stop on first non-AC testcase with consistent scoring and case records. Test TLE/OLE/WA/RE/SPJ error cases.
- [ ] Diagnose session refresh and cross-tab races. Transient network/server/rate-limit errors must not clear a valid session; revoked sessions must still fail. Add failure/retry/rotation tests.
- [ ] Read-only inspect LaoLiTou contest submission and worker logs; correlate final-minute error with actual timestamps, not assumptions. Add regression for any established root cause; do not relabel historical results without judging.
- [ ] Run relevant full suites and builds, independent review, push 42411036, deploy API/frontend/worker changes with rollback and real smoke tests using isolated fixtures. Report confirmed fixes and any unresolved evidence gaps.
