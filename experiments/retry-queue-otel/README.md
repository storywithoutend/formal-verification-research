# OpenTelemetry traces as model-checking evidence

This follow-up asks whether ordinary Effect/OpenTelemetry spans can replace the
retry queue's hand-built abstract transition log as input to the existing
TypeScript and TLC trace validators.

**Verdict:** operationally viable for controlled CI, replay, and diagnostic
runs, provided the application emits a dedicated, unsampled transition event
at the atomic state-commit point and gives every accepted transition a
contiguous commit sequence. Generic production spans recorded at span start or
span end are not reliable enough by themselves.

This is runtime conformance evidence for observed executions. It does **not**
prove the TypeScript implementation, telemetry pipeline, TLA+ model, or a
deployed ENS workflow correct.

## Implementation

The experiment extends [`../retry-queue`](../retry-queue/):

```text
src/queue.ts                       Effect spans and transition events
src/otel-trace.ts                  in-memory exporter and span -> AbstractState[]
src/queue-faulty.ts                four real faulty queue implementations
test/otel-trace.test.ts            custom-log/span comparison and TLC replay
test/otel-failure-modes.test.ts    order, sampling, event loss, cancellation
test/otel-faulty-queues.test.ts    code-fault detection matrix
test/otel-mutation.test.ts         Stryker gate for instrumentation code
```

Each `retry-queue.step` span describes one attempted command. An accepted
command adds one `retry-queue.transition` event with:

| Attribute | Meaning |
|---|---|
| `retry_queue.sequence` | monotonic commit order for this queue instance |
| `retry_queue.state_json` | complete abstract post-state used by replay |
| `retry_queue.placement` | `commit`, `span-start`, or `span-end` experiment variant |
| `retry_queue.action` | abstract command kind |
| `retry_queue.job` | abstract job identifier |
| `retry_queue.worker` | worker, or `<none>` when the command has no worker |

The default `commit` variant allocates the sequence number, updates state,
appends the retained comparison log, and calls `span.event` inside the same
synchronous `Ref.modify` callback. This closes the Effect-fiber interruption
window tested here. It does not make an in-memory span exporter durable or
atomic with an external database/RPC side effect.

`src/otel-trace.ts` uses Effect's `NodeSdk`, an OpenTelemetry
`InMemorySpanExporter`, `SimpleSpanProcessor`, and `AlwaysOnSampler`. It flushes
before layer shutdown, extracts transition events, orders them by sequence, and
feeds the resulting `AbstractState[]` to the existing validators.

## Reproduce

```sh
cd experiments/retry-queue
npm ci
npm run typecheck
npm run test:otel
npm run mutate
```

The full parent experiment remains:

```sh
experiments/retry-queue/scripts/run-all.sh
```

## Findings

### Identical runs

For fast-check seeds `20261119`, `20261120`, and `20261121`, the retained custom
trace and span-derived trace matched step for step. A representative
span-derived trace was accepted by both the TypeScript transition checker and
the generated TLC replay module.

### Concurrency and ordering

Span event timestamps reflect when a fiber reached the instrumentation point,
not necessarily commit order. A controlled schedule let fiber A timestamp its
event, fiber B commit first, and fiber A commit second. Sequence ordering
reconstructed the custom trace; timestamp ordering produced an inadmissible
trace rejected by both validators.

Use a sequence allocated at the same serialization point as the state change.
Do not use exporter arrival order, span start time, span end time, or event
wall-clock time as the transition order.

### Placement and interruption

| Placement | Interrupted point | Observed result |
|---|---|---|
| span start | before state commit | emitted a phantom but model-valid transition; both validators accepted it |
| span end | after state commit, before end event | omitted a committed suffix; both validators accepted the shorter valid prefix |
| commit | before `Ref.modify` | no state change and no transition event |
| commit | after `Ref.modify` | state and transition event both remained visible |

The custom comparison log exposed the span-start/span-end mismatches. Model
replay alone could not, because both incomplete observations were legal model
behaviors.

### Sampling and event loss

A deterministic 50% sampler and a dropped middle event created sequence gaps;
the converter rejected the gaps, and replay without the gap check was rejected
by TypeScript and TLC. Dropping the final event created a contiguous valid
prefix, so both validators accepted it. Detecting suffix loss requires an
external expected final sequence, run-completion record, or durable collector
acknowledgement.

### Real code faults

The experiment implemented four faulty queue variants rather than only editing
JSON fixtures:

| Faulty implementation | Span validation | Independent targeted fast-check property | Neither |
|---|---:|---:|---:|
| non-atomic lease | caught | caught | no |
| duplicate submission on retry | caught | caught | no |
| stale-worker failure requeue | caught | caught | no |
| retry-limit off-by-one | caught | caught | no |

For all four, the span-derived trace equaled the implementation's retained
custom trace and was rejected by both the TypeScript and TLC validators. The
fast-check properties separately compared observable state/acceptance against
the executable model; they did not call the trace validator.

See [`results.md`](./results.md) for the recorded run.

## Production recommendation

Treat spans as model-checking evidence only when all of the following hold:

1. **Dedicated event:** emit a versioned abstract transition event, not merely
   ordinary span attributes.
2. **Commit placement:** emit from the same serialized commit section that
   chooses the post-state and sequence. For a database, prefer a durable outbox
   written in the transaction; an in-memory `span.event` is not crash-atomic.
3. **Stable order:** allocate a monotonic sequence per modeled aggregate or
   partition and replay by that sequence.
4. **Integrity:** reject duplicates and gaps; record run/aggregate identity,
   model/schema version, initial-state identity, and an expected final sequence
   or explicit completion marker.
5. **No verification sampling:** route transition events through an always-on
   verification stream. Head/tail sampling of normal observability traffic may
   remain separate.
6. **Flush and retention:** require exporter flush/collector acknowledgement
   before validation and retain the evidence used for a verdict.
7. **Minimal abstraction:** record the model state needed for `AllowedStep`,
   excluding secrets and unstable implementation detail.
8. **Layered checks:** retain targeted property tests and model checking;
   accepted traces establish conformance only for complete observed runs.

With those controls, Effect/OpenTelemetry integration is a practical way to
capture replay evidence without maintaining a second hand-written trace path.
Without them, spans are useful diagnostics but not trustworthy verification
input.
