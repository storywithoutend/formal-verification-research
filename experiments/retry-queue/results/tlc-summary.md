# TLC summary

Run on 2026-11-19 (macOS arm64) with:

- Temurin OpenJDK `21.0.13.1+2-LTS`
- `tla2tools.jar` release `v1.7.4`, TLC `2.19` rev `5a47802`
- SHA-256 `936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88`
- deterministic flags: `-workers 1 -fp 0`

## Main finite model

Command equivalent:

```sh
java -XX:+UseParallelGC -cp tla2tools.jar tlc2.TLC \
  -workers 1 -fp 0 -coverage 1 -config RetryQueue.cfg RetryQueue
```

Result:

```text
Model checking completed. No error has been found.
1247 states generated, 495 distinct states found, 0 states left on queue.
The depth of the complete state graph search is 13.
```

All six abstract actions (`Lease`, `RetryableFailure`, `WakeRetry`, `Submit`,
`Confirm`, `PermanentFailure`) had non-zero generated transitions in the
coverage report. This is exhaustive only for the configured two jobs, two
workers, and `MaxAttempts = 2`; it is not a proof of the TypeScript program.

## Deliberate model faults

Each fault extends the normal transition relation with one bad action. TLC must
exit `12` and name an invariant violation.

| Config | Planted fault | TLC result | Shortest search depth shown |
|---|---|---|---:|
| `FaultMissingAtomicity.cfg` | Add a second owner to an already leased job | `ExclusiveLease` violated | 3 |
| `FaultDuplicatedEffect.cfg` | Submit the external renewal effect twice | `SubmitAtMostOnce` violated | 4 |
| `FaultStaleWorkerRace.cfg` | A stale worker requeues a job while its current owner remains | `LeasePhaseConsistent` violated | 3 |
| `FaultBadRetry.cfg` | Lease again after the retry budget is exhausted | `RetryBound` violated | 7 |

The fault runs intentionally stop at their first counterexample, so their
“states left on queue” values do not describe complete state spaces.
