# TLC run excerpts

Trimmed, annotated excerpts of real TLC runs made on 2026-11-15 (UTC+8) against the
`verification/migration` model, using `tla2tools.jar` v1.7.4 (reports itself as
TLC2 Version 2.19) on Temurin Java 21, with the same flags the folder's
`verify-sensitivity.sh` uses: `-workers 1 -fp 0 -config <cfg> Model`.

Full state dumps were removed on purpose; traces show only the fields that changed.

| File | Config | Result |
|---|---|---|
| hardened.txt | Hardened.cfg | pass, exit 0, 124 generated / 81 distinct, depth 3 |
| hardened-coverage.txt | Hardened.cfg -coverage 1 | per-action counts |
| contract.txt | Contract.cfg | pass, exit 0, 16 generated / 15 distinct, depth 15, temporal property checked |
| NoCopyRouteGuard.txt | NoCopyRouteGuard.cfg | E4_CopyRequiresRoute violated, exit 12 (expected) |
| current.txt | Current.cfg | A5_PendingAttemptNeverReprompts violated, exit 12 (expected: stops at first violation) |
| demo-deadlock-without-Done.txt | scratch copy, Done removed | Deadlock reached, exit 11 (teaching demo only) |
| mutations-summary.tsv | all 37 No*.cfg | 37/37 exit 12 with the named invariant |
| current-per-property-summary.tsv | each current property alone | 37/37 match current-expectations.tsv |

TLC exit codes (from tlc2/output/EC.java, ExitStatus): 0 success, 10 assumption
violated, 11 deadlock, 12 safety (invariant) violation, 13 liveness violation.
