# Trace validation summary

Generated and checked on 2026-11-19. The quick validator replays the event in
TypeScript; the independent path generates a TLA+ trace instance and asks TLC
whether every adjacent pair satisfies `AllowedStep` in `RetryQueue.tla`.

| Fixture | States | TypeScript replay | TLC | TLC signal |
|---|---:|---|---|---|
| `good-trace.json` | 10 | accept | accept (0) | No error |
| `fault-missing-atomicity.json` | 3 | reject | reject (11) | Error: Deadlock reached. |
| `fault-duplicated-effect.json` | 4 | reject | reject (11) | Error: Deadlock reached. |
| `fault-stale-worker-race.json` | 3 | reject | reject (11) | Error: Deadlock reached. |
| `fault-bad-retry.json` | 7 | reject | reject (11) | Error: Deadlock reached. |

A rejected trace demonstrates a discrepancy for that execution. Acceptance does
not prove all implementation executions conform; event completeness,
instrumentation, and unobserved schedules remain outside this check.
