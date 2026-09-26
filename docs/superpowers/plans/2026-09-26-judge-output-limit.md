# Judge output limits and cached output

Approved scope: make configured per-problem output limits effective without buffering up to 1 GiB in the worker/API. Keep checker verdict semantics and ordinary output comparison (CR/LF normalization and trailing whitespace tolerance).

1. Add failing tests for 1024 MiB sandbox collector limit, cached stdout response validation, cached SPJ stdin/user_output, streaming standard comparison and cleanup.
2. Pass outputLimit through initial/rejudge queue jobs; legacy jobs read the current problem limit with safe 64 MiB default. No schema migration.
3. Production contestant runs cache stdout in go-judge, return only bounded preview. Pass fileId directly as SPJ stdin and user_output. Stream cached output for standard comparison; never compare a truncated preview. Delete cached stdout after each case and on failure.
4. Keep compiler/checker stdout small. Preserve successful-response validation based on requested streams/cache, timeouts and explicit SYSTEM_ERROR for missing files.
5. Run regression/build and isolated live sandbox checks above 10 MiB plus a deliberately lower OLE limit. Check actual contestant case without creating fake contest records.
6. Review, push 42411036, deploy API queue changes and teacher-host worker changes with rollback; verify hashes and health. Do not restart teacher training or sandbox unnecessarily.
