# Editor indentation and profile difficulty

CF investigation: sync fetches only most recent 1000 submissions, then de-duplicates OK verdicts and matches published local CF sources. Observed Tishow__Liuche log fetched=1000, unique accepted=321, matched=173 (148 unmatched). Cannot attribute the user's approximate 700 deficit solely to local bank coverage. Full-history pagination is a separate behavior change, not included in this diagnosis.

Editor: explicit four-space indentUnit and tabSize=4. High-priority Enter uses CodeMirror insertNewlineKeepIndent rather than syntax-derived indentation. Reuse extension for initial construction and language switching; preserve draft persistence. Test C++/Python/Java, opening brace and tab behavior.

Difficulty: aggregate missing values under UNRATED instead of JS object key "null". Sort P0..P5 then UNRATED. Frontend labels/class must treat null, "null", NONE, UNRATED as unrated, not P1. Existing valid/legacy mappings retained; no database rewrite.

Execution: regression tests red then green; full backend/frontend suites and builds; read-only live stats verification plus browser keyboard checks; code review; derived backend image and atomic static update with rollback; retain proxy/worker settings; push 42411036 if reachable.

## Verified results

- Read-only CF request count=10000 returned 2477 submissions (not truncated), 809 unique OK problems, 594 matching published local CF sources, 215 unmatched. Recent 1000 cover only 321 unique accepted / 173 matched. Thus 421 additional local matches are outside the current sync window. No sync records changed by audit.
- Exact screenshot data reproduced: P0=92, P1=45, P2=32, P3=6, P4=1, "null"=2, total178. After backend patch the last bucket is UNRATED=2 with total178 unchanged.
- Backend 418 tests / 50 suites passed; frontend 67 tests / 23 suites passed; both production builds succeeded. Added active-autocomplete test following review: highest-precedence Enter preserves indent instead of accepting suggestion. Mouse selection remains available for suggestions.
- Real browser on deployed site tested C++/C/Python/Java Enter, Tab, Shift+Tab, language switching and draft persistence after refresh. No page errors.
- Images `swufe-oj:editor-profile-20260920`, `swufe-oj-caddy:editor-profile-20260920`; rollback tags use `before-editor-profile-20260920`. Proxy not restarted, judge queue unpaused and empty with one worker connected.
