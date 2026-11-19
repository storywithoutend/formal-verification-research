# Model-first experiment status

Completed the base experiment and OpenTelemetry tracing follow-up on 2026-11-19
on `main`.

## Delivered

### Base model-first experiment

- `research/model-first-evidence.md`: validated evidence table, bibliographic
  discrepancies, artifacts, and guarantee taxonomy.
- `experiments/retry-queue/`: ENS-flavored concurrent renewal workflow with:
  - TLA+ model/config and four model faults;
  - complete TLC finite-state run and bounded Apalache run;
  - TypeScript / Effect implementation with atomic `Ref.modify`, injected
    outcomes, concurrent fibers, and `TestClock`;
  - abstract transition logs and TLC-backed trace replay;
  - fast-check model-based tests and Stryker mutation testing.
- `research/model-first-feasibility.md`: feasibility assessment, recommended
  architecture, prototype plan, acceptance criteria, costs, and open questions.

### OpenTelemetry follow-up

- Effect/OpenTelemetry instrumentation on each queue command.
- A `retry-queue.transition` span event containing the complete abstract
  post-state, command fields, placement, and monotonic commit sequence.
- `src/otel-trace.ts`: in-memory export, forced flush, event extraction,
  sequence/timestamp ordering, sequence-gap checks, and conversion to the
  existing `AbstractState[]` replay format.
- Step-for-step comparison with the retained custom trace for seeds `20261119`,
  `20261120`, and `20261121`.
- TypeScript and TLC replay of span-derived traces.
- Controlled tests for timestamp ordering, span-start/span-end/commit placement,
  50% sampling, dropped middle/final events, and fiber interruption.
- Four real faulty queue implementations: non-atomic lease, duplicated retry
  submission, stale-worker requeue, and retry-limit off-by-one.
- Independent targeted fast-check properties and span validation caught all four
  planted code faults.
- `experiments/retry-queue-otel/README.md`: method, guarantee boundary, results,
  and production recommendation.
- `experiments/retry-queue-otel/results.md`: committed result tables.

## Recorded results

- TLC normal model: 1,247 generated / 495 distinct states, depth 13.
- Four TLA+ fault models produced their intended invariant violations.
- Apalache: no invariant error through 12 transitions; this is bounded, not an
  inductive proof.
- TypeScript strict typecheck passed.
- Vitest: 37/37 tests passed in eight files. TLC-backed files are serialized to
  avoid resource races between concurrent JVMs.
- OpenTelemetry subset: 23/23 tests passed in four files.
- fast-check base model test: 200 runs with seed `20261119`.
- Custom and span-derived traces matched for all three comparison seeds.
- Sequence ordering reconstructed concurrent commit order; timestamp ordering
  did not and was rejected by TypeScript and TLC replay.
- Start/end cancellation and a dropped final event produced legal-looking but
  incomplete/phantom traces that replay alone could not detect.
- Sequence gaps from 50% sampling or a dropped middle event were detected.
- Four real code faults: 4/4 caught by TypeScript replay, 4/4 caught by TLC
  replay, and 4/4 caught by independent targeted fast-check properties.
- Stryker: 95 mutants generated; 66 type-invalid/rejected by the checker; all 29
  runtime-valid mutants killed; reported mutation score 100%.
- `npm audit --omit=dev`: zero production dependency vulnerabilities. Full npm
  audit reports six moderate vulnerabilities in the development toolchain.
- The installed OpenTelemetry SDK trace-node/base packages emit deprecation
  warnings recommending the consolidated `@opentelemetry/sdk-trace` package.
- Final `experiments/retry-queue/scripts/run-all.sh`: exit 0.

## Operational verdict

OpenTelemetry spans are operationally viable as model-checking input only when
transition events are emitted at the serialized commit point, ordered by a
commit sequence, routed through an unsampled verification stream, flushed and
retained, and protected by gap/duplicate plus explicit completion checks. For a
durable system, write verification evidence through a transactional outbox;
in-memory `span.event` is interruption-consistent in this experiment but is not
crash-atomic with storage or RPC effects.

Generic sampled production traces are diagnostics, not trustworthy verification
evidence. An accepted trace proves only that the complete observed execution
conforms to the abstract transition relation. It does not prove the TypeScript
implementation, telemetry pipeline, or deployed ENS workflow correct.

## Tracing commits pushed

- `178d7e6` — docs: add Effect tracing experiment brief
- `faaed31` — experiment: derive TLC traces from Effect spans
- `1b0ba0e` — experiment: test tracing failure modes
- `b463a5a` — experiment: run code faults through span validation
- `c55aca5` — test: compare code faults with fast-check
- `4799fe5` — test: cover interruption before traced commit
- `f35427a` — docs: record OpenTelemetry trace experiment
- `2bdbe93` — test: serialize TLC-backed Vitest files

## Still open

- Apply the workflow to one real public TypeScript / Effect feature with a
  reviewed abstraction and production-safe, privacy-reviewed trace schema.
- Replace in-memory event emission with a durable transactional outbox and test
  crashes, retries, collector acknowledgement, and recovery.
- Add run/aggregate identity, model/schema version, initial-state identity, and
  explicit final-sequence/completion evidence to detect suffix loss.
- Evaluate migration from the deprecated OpenTelemetry trace-node/base packages
  when Effect's integration supports the consolidated SDK package.
- Resolve the trusted bridge for any verified-IR-to-TypeScript approach; no
  trustworthy general Effect/TypeScript backend was found.
