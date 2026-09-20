# Contest submission filter and SPJ audit

## Submission filter

The contest submissions page has a toggle for the current user's submissions. The API accepts `mine=true` and restricts the database query to the authenticated viewer before applying the 80-record limit. It never accepts a client-supplied user ID for this filter. Existing contest access and source-code visibility rules remain in place. URL changes abort obsolete feed requests through the existing feed utility.

Verification: the new backend regression initially failed because its query lacked the user restriction, then passed with the implementation (11 targeted tests). Frontend 51 tests, browser contest arena including toggling both directions, backend build and frontend typecheck/build passed.

Deployment: runtime commit `d0df902b15f75eb3967a302f4c24c67c46ff872a` deployed to test.singularitylab.online (backend and frontend only). All 21 contest backend tests passed. Two temporary live accounts verified both API ownership restriction and browser toggle in both directions. Fixtures were removed afterward; no existing accounts or submissions were changed.

## SPJ diagnostic result

The current judge first runs the contestant program in go-judge, then runs the authored checker separately with contestant stdout on stdin and files named `input`, `output`, `user_output`. Boolean stdout and legacy zero-exit/no-stdout checkers are supported. Successful execution of the contestant alone is not the final SPJ verdict.

The reported submission in 测试赛3 was matched to T24292 ELYSIA. Its checker returns 0 inside the multi-case loop when a single case passes, so later answers are never validated. Reads, coordinate duplicates and empty sets also lack robust validation.

Sandbox reproduction with the exact stored checker:

```text
input: 2\n4 1\n4 1\n
user_output: 1\n0 0\n-1\n    -> successful exit, empty stdout (incorrect acceptance)
user_output: 1\n0 0\n         -> successful exit, empty stdout (incorrect acceptance)
```

The specified contestant source contains an out-of-bounds `a[103]` read. On the diagnostic sandbox with this input it prints `01\n0 0\n01\n0 0\n`; integer extraction interprets `01` as 1. C++ undefined behavior does not guarantee a runtime error, so this source construct by itself does not prove an invalid judged output.

No checker, test data, historical verdict or contest score was changed during diagnosis. Correcting the checker requires validating every case, rejecting failed reads/invalid counts/duplicates/trailing tokens and returning success only after all cases pass. Existing exit-code SPJs must not be globally rejected merely for having empty stdout.
