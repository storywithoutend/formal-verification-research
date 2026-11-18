# Stryker mutation summary

Run on 2026-11-19 with StrykerJS `10.1.1`, the Vitest runner, and the
TypeScript checker. The mutation target is the Effect/concurrency adapter
`src/queue.ts`; the larger executable abstract model is checked separately by
TLC, trace replay, fault fixtures, and fast-check.

```text
41 mutants generated
35 rejected by the TypeScript checker (reported by Stryker as errors)
6 runtime-valid mutants killed
0 survived
0 had no coverage
mutation score: 100.00% (6 / 6 runtime-valid mutants)
duration: 16 seconds
```

The score is deliberately reported with its denominator. It is evidence that
the selected tests distinguish the six type-correct mutations Stryker could
run in this small adapter. It is not evidence that all real faults, all
TypeScript code, or the deployed environment are correct.
