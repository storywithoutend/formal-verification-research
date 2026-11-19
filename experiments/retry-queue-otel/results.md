# Recorded OpenTelemetry experiment results

Run on 2026-11-19 with Node `24.22.1`, Effect `3.22.4`,
`@effect/opentelemetry` `0.64.2`, OpenTelemetry SDK `2.12.0`, Vitest `4.1.12`,
fast-check `4.10.3`, TLC `1.7.4`, and StrykerJS `10.1.1`.

## Commands

```text
npm run typecheck
  passed

npm test
  8 test files passed
  37 tests passed

npm run test:otel
  4 test files passed
  23 tests passed

npm run mutate
  95 mutants generated
  66 rejected by the TypeScript checker
  29/29 runtime-valid mutants killed
  0 survived; 0 no coverage
  mutation score: 100.00%
```

`npm audit --omit=dev` reported zero production dependency vulnerabilities.

## Custom trace versus spans

| Check | Result |
|---|---|
| seed `20261119` | exact state-by-state match |
| seed `20261120` | exact state-by-state match |
| seed `20261121` | exact state-by-state match |
| TypeScript replay of representative span trace | accepted |
| TLC replay of representative span trace | accepted |

## Telemetry failure modes

| Perturbation | Sequence/integrity check | TypeScript replay | TLC replay | Comparison with retained custom trace |
|---|---|---|---|---|
| timestamp order under controlled concurrency | not applicable | rejected | rejected | mismatch |
| sequence order under same concurrency | passed | accepted | accepted | exact match |
| span-start event, then cancel before commit | passed | accepted phantom transition | accepted phantom transition | mismatch |
| span-end event, cancel after commit | passed as empty prefix | accepted prefix | accepted prefix | mismatch |
| commit placement, cancel before commit | passed | accepted empty trace | not separately run | exact match |
| commit placement, cancel after commit | passed | accepted | not separately run | exact match |
| deterministic 50% sampling | gap detected | rejected when replay forced | rejected when replay forced | incomplete |
| dropped middle event | gap detected | rejected when replay forced | rejected when replay forced | incomplete |
| dropped final event | passed as contiguous prefix | accepted prefix | accepted prefix | mismatch |

The accepted phantom/prefix cases are expected limitations, not validator
successes. A legal trace prefix does not prove that telemetry is complete.

## Real faulty queue implementations

| Faulty implementation | Span-derived trace vs custom trace | TypeScript replay | TLC replay | Independent targeted fast-check property | Neither |
|---|---|---|---|---|---|
| non-atomic lease | exact match | caught | caught | caught | no |
| duplicate submission on retry | exact match | caught | caught | caught | no |
| stale-worker failure requeue | exact match | caught | caught | caught | no |
| retry-limit off-by-one | exact match | caught | caught | caught | no |

These are targeted planted faults. Four detections do not estimate a general
fault-detection probability and do not prove the implementation correct.

## Guarantee boundary

- Sequence-ordered, complete span events can provide evidence that one observed
  execution conforms to `AllowedStep`.
- TLC replay remains finite and trace-specific; it does not explore unobserved
  implementation schedules.
- Sampling, exporter loss, process crashes, schema drift, and missing final
  events can make a legal-looking trace incomplete.
- In-memory `Ref.modify` plus `span.event` is interruption-consistent in this
  process, but not durable or transactionally atomic with external storage/RPC.
