# TypeScript and test summary

Run on 2026-11-19 with Node `24.22.1`, npm `11.19.1`, TypeScript `5.9.3`,
Effect `3.22.4`, Vitest `4.1.12`, and fast-check `4.10.3`.

```text
npm run typecheck
  passed (tsc --noEmit)

npm test
  4 test files passed
  14 tests passed
  duration 3.66s
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
- TLC-backed tests accept one good trace and reject all four planted-fault
  traces.

`npm audit --omit=dev` reported zero production dependency vulnerabilities.
The npm audit for the development toolchain reported advisories in transitive
dev dependencies; these tools are not shipped by the experiment.
