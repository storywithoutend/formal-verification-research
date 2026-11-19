# Model-first concurrent ENS renewal queue

A small TypeScript / Effect experiment that begins with a TLA+ transition model
and ends with an instrumented implementation, TLC-backed trace validation,
fast-check model-based tests, and Stryker mutation testing.

The made-up workflow renews `alice.eth` and `bob.eth` using two concurrent
workers. Jobs can be leased, fail transiently, wait in deterministic backoff,
retry, submit one external renewal effect, confirm, or fail permanently.

Passing these checks does **not** prove the TypeScript implementation or a real
ENS renewal deployment correct. The results are scoped to the model,
configured constants, observed traces, generated tests, and listed assumptions.

## Files

```text
model/RetryQueue.tla          pure abstract transition relation and invariants
model/RetryQueue.cfg          TLC finite instance: 2 jobs, 2 workers, 2 attempts
model/RetryQueueFaults.tla    four deliberately bad model actions
model/TraceReplay.tla         constrains TLC to an implementation state trace
src/model.ts                  executable mirror used by tests and quick replay
src/queue.ts                  Effect implementation plus transition span events
src/otel-trace.ts             OpenTelemetry spans -> abstract state trace
src/queue-faulty.ts           four real faulty queue implementations
src/tlc-trace.ts              JSON state trace -> generated TLA+ replay module
src/faults.ts                 four planted bad implementation traces
test/model-based.test.ts      fast-check commands + asyncModelRun
test/queue.test.ts            concurrent fibers and Effect TestClock
test/otel-*.test.ts           span replay, failure modes, faults, mutation gate
results/                      committed summaries and replayable JSON traces
```

## Abstract state and code mapping

| TLA+ field/action | TypeScript representation | Instrumentation boundary |
|---|---|---|
| `state.phase[job]` | `AbstractState.phase[job]` | emitted after every accepted command |
| `state.owners[job]` | `owners[job]: Worker[]` | the whole owner set is logged, not only the caller |
| `state.attempts[job]` | `attempts[job]` | incremented atomically with `Lease` |
| `state.submissions[job]` | `submissions[job]` | abstract count of the external renewal effect |
| `state.event` | `{ kind, job, worker }` | identifies the abstract action TLC must replay |
| `AllowedStep(from,to)` | `applyCommand(from,command)` | TLC is the independent trace oracle; the TS mirror is the fast path |

`RenewalQueue.execute` updates the current abstract state, appends its retained
comparison trace, allocates a sequence, and records its OpenTelemetry transition
event in one `Ref.modify`. No ambient clock or randomness is read. Retry timing
uses Effect `sleep`, replaced by `TestClock` in tests. Outcomes are explicit
inputs (`success`, `retryable-failure`, `permanent-failure`) rather than hidden
random calls, so runs are reproducible.

A real RPC submission cannot generally be atomic with an in-memory state update.
Production use would need an idempotency key or durable outbox; this experiment
models the intended exactly-once abstract effect, not that infrastructure.

## Safety properties

TLC checks:

1. `ExclusiveLease`: at most one worker owns a job.
2. `LeasePhaseConsistent`: exactly one owner iff the phase is `leased`.
3. `SubmitAtMostOnce`: the renewal effect count never exceeds one.
4. `CompletionAfterSubmission`: a completed job has exactly one submission.
5. `RetryBound`: attempts never exceed `MaxAttempts`.
6. `TerminalUnowned`: submitted, done, and failed jobs have no lease owner.

The model also checks `TypeOK`. TLC explores all 495 reachable states for the
configured finite instance. Apalache separately checks all invariants through
12 symbolic steps; that Apalache run is bounded, not an inductive proof.

## Setup

Tools are installed only under `experiments/.tools/`; no `sudo` is used.

```sh
cd formal-verification-research
experiments/retry-queue/scripts/install-tools.sh
cd experiments/retry-queue
npm ci
```

Pinned/recorded tools:

- local Temurin JDK 21 from Adoptium;
- TLA+ tools v1.7.4 (`tla2tools.jar` checksum verified by the installer);
- Apalache v0.63.0 (release checksum verified by the installer);
- npm versions pinned in `package-lock.json`.

## Run

From `experiments/retry-queue/`:

```sh
npm run typecheck          # strict TypeScript
npm test                   # Vitest + fast-check + TLC trace tests
npm run test:otel          # span replay, ordering, loss, cancellation, code faults
npm run trace:generate     # refresh good/fault JSON traces
npm run trace:validate-all # TS replay and generated TLA+ replay
npm run tlc                # complete finite model + four expected mutants
npm run apalache           # bounded symbolic invariant check
npm run mutate             # Stryker on the Effect adapter
```

Or from the repository root:

```sh
experiments/retry-queue/scripts/run-all.sh
```

## Recorded results

| Layer | Result |
|---|---|
| TLC normal model | pass; 1,247 generated / 495 distinct states; depth 13 |
| TLC fault models | 4/4 expected invariant violations, exit 12 |
| Apalache | no invariant error through 12 steps, exit 0 |
| TypeScript | strict typecheck passed |
| Vitest | 37/37 tests passed in eight files |
| fast-check | 200 model-based runs, fixed seed `20261119` |
| Good implementation trace | accepted by TS replay and TLC |
| Planted bad traces | 4/4 rejected by TS replay and TLC (TLC deadlock at the first inadmissible step) |
| Stryker | 95 generated; 66 type-invalid and rejected by checker; 29/29 runtime-valid mutants killed; reported score 100% |

Detailed, committed evidence:

- [`results/tlc-summary.md`](./results/tlc-summary.md)
- [`results/apalache-summary.md`](./results/apalache-summary.md)
- [`results/test-summary.md`](./results/test-summary.md)
- [`results/trace-validation-summary.md`](./results/trace-validation-summary.md)
- [`results/mutation-summary.md`](./results/mutation-summary.md)
- [`results/fault-matrix.md`](./results/fault-matrix.md)
- [`../retry-queue-otel/README.md`](../retry-queue-otel/README.md) and
  [`../retry-queue-otel/results.md`](../retry-queue-otel/results.md)

## Planted faults

- missing atomicity: a second worker appears in the owner set;
- duplicated effect: submission count changes from one to two;
- stale-worker race: a stale failure requeues a job while its current owner
  remains;
- bad retry: a failed job is leased for attempt three although the limit is two.

The detection matrix deliberately records non-detections. In particular,
fast-check’s generated legal command sequences do not independently cover
illegal stale commands or all schedule-sensitive races. The TLC model mutants
and trace validator cover those specific fixtures.

## Guarantee boundaries

- **TLC:** exhaustive for this finite model only, not the TS implementation.
- **Apalache:** bounded symbolic checking through 12 transitions.
- **Trace replay:** one logged execution conforms to the abstract relation;
  omitted events and unobserved executions remain unchecked. The OpenTelemetry
  follow-up demonstrates that sampling and lost suffixes can look like valid
  prefixes unless an external completion count is present.
- **fast-check:** sampled command sequences agree with the executable model.
- **Stryker:** selected tests kill selected type-correct mutations in
  `src/queue.ts`; the current denominator is 29 runtime-valid mutants.
- **Environment:** Node, Effect, the Java tools, filesystem, npm dependencies,
  and a real ENS/RPC environment are not formally verified here.
