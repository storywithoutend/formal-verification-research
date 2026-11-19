# Stryker mutation summary

Run on 2026-11-19 with StrykerJS `10.1.1`, the Vitest runner, and the
TypeScript checker. The mutation target is the Effect/concurrency and tracing
adapter `src/queue.ts`; the larger executable abstract model is checked
separately by TLC, trace replay, fault fixtures, and fast-check.

```text
95 mutants generated
66 rejected by the TypeScript checker (reported by Stryker as errors)
29 runtime-valid mutants killed
0 survived
0 had no coverage
mutation score: 100.00% (29 / 29 runtime-valid mutants)
duration: 38 seconds
```

The Stryker Vitest configuration includes the original queue/model-based tests
and `test/otel-mutation.test.ts`. The OpenTelemetry gate checks event names,
attributes, state payloads, commit sequences, and the start/end experiment
variants without invoking TLC inside each mutation run.

The score is deliberately reported with its denominator. It is evidence that
the selected tests distinguish the 29 type-correct mutations Stryker could run
in this adapter. It is not evidence that all real faults, all TypeScript code,
telemetry delivery, or the deployed environment are correct.
