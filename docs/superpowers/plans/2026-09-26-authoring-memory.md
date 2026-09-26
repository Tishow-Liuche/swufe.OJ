# Bounded-memory authoring

Approved objective: prevent 512 MiB API crashes during test-data replacement and editing without losing existing versions or weakening ZIP validation.

1. Editor detail and current-version locks select only test-case identifiers, never input/output bodies.
2. New statement/checker versions copy unchanged cases with PostgreSQL INSERT SELECT, keeping all historical rows immutable.
3. ZIP validation builds a manifest. Decode one case at a time, write large text in bounded parameter chunks; publish the new version in one transaction. Failed imports roll back atomically.
4. Upload compressed archives to temporary disk, clean up on success/failure, limit concurrent imports before buffering. Retain existing 50 MiB archive/64 MiB entry/100 MiB expansion limits and CRC checks.
5. Editor load errors show retry instead of empty writable forms.
6. Test rollback, old-version preservation, filename pairing, malformed archives, large-fixture RSS under the production memory ceiling, and successful reload. Deploy only after evidence; no production fixture deletion.
