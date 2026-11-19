# TypeScript and test summary

Run on 2026-11-19 with Node `24.22.1`, npm `11.19.1`, TypeScript `5.9.3`,
Effect `3.22.4`, `@effect/opentelemetry` `0.64.2`, OpenTelemetry SDK `2.12.0`,
Vitest `4.1.12`, and fast-check `4.10.3`.

```text
npm run typecheck
  passed (tsc --noEmit)

npm test
  8 test files passed
  37 tests passed
  duration 13.30s

npm run test:otel
  4 test files passed
  23 tests passed
  duration 8.88s
```

Coverage by behavior:

- two concurrent Effect fibers attempt the same lease; the atomic `Ref.modify`
  admits exactly one;
- `TestClock.adjust("5 seconds")` deterministically wakes a retry while another
  name-renewal job completes;
- success, retryable failure, and permanent failure paths are exercised;
- fast-check executes 200 model-based command runs with seed `20261119`,
  comparing the Effect state after every accepted command with the executable
  abstract transition function;
- TLC-backed tests accept one good retained trace and reject all four planted
  bad trace fixtures; Vitest files run serially to avoid resource races between
  concurrent TLC JVMs;
- OpenTelemetry-derived traces match the retained trace for three fixed seeds
  and feed the same TypeScript and TLC validators;
- controlled tests cover concurrent timestamp reordering, start/end/commit event
  placement, sampling, dropped events, and fiber interruption;
- four real faulty queue implementations are rejected by span validation and by
  independent targeted fast-check properties.

`npm audit --omit=dev` reported zero production dependency vulnerabilities.
The npm audit for the development toolchain reported advisories in transitive
dev dependencies; these tools are not shipped by the experiment.
