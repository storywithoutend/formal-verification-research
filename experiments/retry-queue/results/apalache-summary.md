# Apalache summary

Run on 2026-11-19 with Apalache `0.63.0` (build `67b8ec6`) and the
project-local Temurin JDK 21. The release archive SHA-256 was
`a756e96af249bf33cd7629667a49472cb26ac8227c48583da139b414834d59df`.

Command: `scripts/run-apalache.sh`, which symbolically checks all seven state
invariants through 12 `Next` steps using the same two-job, two-worker,
`MaxAttempts = 2` constants as TLC.

Result:

```text
Your types are purrfect!
Found 6 transitions
Checker reports no error up to computation length 12
EXITCODE: OK
```

This is a bounded symbolic check, not an inductive proof and not a proof of the
TypeScript implementation. TLC separately completed the entire finite state
graph for these constants.
