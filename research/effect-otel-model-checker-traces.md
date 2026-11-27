# Effect/OpenTelemetry traces as model-checker input

Validated 2026-11-27. This note uses public primary sources only.

## Short answer

I found **no public Effect (Effect-TS) package or repository that combines
`@effect/opentelemetry` with TLA+ trace validation, Quint/ITF trace emission, or
another model checker**. Searches combined the exact package name with `TLA+`,
`TLC`, `Quint`, `ITF`, `model checker`, `trace validation`, and `formal
specification`, across general web search, GitHub-indexed results, npm results,
the Effect repository, and the relevant TLA+/Quint ecosystems.

That is evidence of no *publicly discoverable* implementation, not proof that no
private implementation exists. The exact combination appears novel, but its
parts and methodology are not:

- Effect already provides fiber-aware tracing and an OpenTelemetry `Layer` that
  accepts custom `SpanProcessor`s.
- OpenTelemetry already provides causal trace context, span events, links,
  exporters, and Collector pipelines.
- Several projects already validate Java, Go, Rust, Elixir, or generated PGo
  execution traces against TLA+ or Quint artifacts.
- A 2026 preprint directly compares OpenTelemetry traces with manually authored
  design traces, but it does not use a model checker or formal transition spec.

The module is feasible. A small in-process prototype is a few days of work; a
commercially dependable multi-service pipeline needs explicit ordering,
integrity, completion, durability, privacy, and model/action mapping that
OpenTelemetry does not supply automatically.

## Exact prior-art check: Effect + OpenTelemetry + model checker

### What exists

[`@effect/opentelemetry`](https://github.com/Effect-TS/effect/tree/main/packages/opentelemetry)
exports Effect tracing, metrics, and logs through the OpenTelemetry SDK. Its
current Node layer accepts one or more custom `SpanProcessor`s, creates a scoped
`NodeTracerProvider`, and force-flushes and shuts it down when the Layer is
released:

- [`NodeSdk.ts`](https://github.com/Effect-TS/effect/blob/main/packages/opentelemetry/src/NodeSdk.ts)
- [`OtelTracer.ts`](https://github.com/Effect-TS/effect/blob/main/packages/opentelemetry/src/OtelTracer.ts)
- [Effect tracing documentation](https://effect.website/docs/observability/tracing/)

Effect's tracer carries the current parent span in Effect context, creates
OpenTelemetry spans from `Effect.withSpan`, and maps Effect attributes, events,
links, errors, and status into OpenTelemetry. The package is part of the
[Effect repository](https://github.com/Effect-TS/effect), licensed MIT and free
for commercial use.

### What was not found

No public package was found that adds any of the following to that integration:

- model-action events or abstract state projection;
- TLA+ trace-validation NDJSON;
- Quint/Apalache Informal Trace Format (ITF) output;
- TLC, Apalache, or Quint conformance invocation;
- model-version, trace-completeness, or logical-order integrity checks.

The experiment already present in this repository,
[`experiments/retry-queue-otel/`](../experiments/retry-queue-otel/README.md), is
therefore a local proof of concept for the exact pipeline, not evidence of an
external reusable package.

## Closely related formal trace-validation prior art

There is no single universal “TLA+ NDJSON trace format.” The tools below define
formats and trace specifications for their own validation method. ITF is more
standardized, but it was designed primarily as a state-trace interchange
format, not as an OpenTelemetry event schema.

| Project | Primary sources | What it is | Pros | Cons / gap from the requested module | License and commercial use |
|---|---|---|---|---|---|
| **Model-Based Trace-Checking / early TLC trace checking** | [Model-Based Trace-Checking](https://arxiv.org/abs/1111.2825), [Ron Pressler's TLA+/TLC note](https://pron.github.io/files/Trace.pdf), [TLA+ Wiki overview](https://docs.tlapl.us/using:tlc:trace_validation) | Foundational descriptions of analyzing finite implementation traces by constraining a formal model/model checker, including generating a TLA+ behavior from recorded states and checking safety/refinement conditions with TLC. | Establishes that implementation traces can be checked with an existing model checker rather than a bespoke monitor; influenced later MongoDB and TLA+ trace-validation work. | Method descriptions, not an Effect/OTel package. Early examples are small and leave instrumentation, ordering, and state mapping to the user. | Papers/notes are publicly readable; no reusable software artifact or software license is supplied by these publications. Reimplementation is required. |
| **Trace Validation for TLA+ / `trace_validation_tools`** | [paper](https://arxiv.org/abs/2404.16075), [published chapter](https://doi.org/10.1007/978-3-031-77382-2_8), [tools](https://github.com/tracevalidation/trace_validation_tools), [Two-Phase Commit case study](https://github.com/tracevalidation/TwoPhase), [Raft case study](https://github.com/tracevalidation/Raft) | Java instrumentation records events and selected updates to TLA+ variables as JSON/NDJSON. Python scripts merge distributed logs. A TLA+ trace specification constrains TLC so it decides whether the observed execution is admitted by the model. Missing variable values may be inferred by TLC. | Closest methodological match. Handles partial state, explicit action names, implementation/specification atomicity mismatches, and distributed traces. Found discrepancies in every evaluated implementation. | Instrumentation is Java-specific and hand-authored; no OpenTelemetry integration. A centralized/logical clock is still required. More omitted state means more TLC search and a weaker observation. The paper explicitly does not claim implementation correctness. | Tools are MIT; TLC/TLA+ tools are MIT. Free and commercially usable with notices. Compute/CI cost remains. |
| **TraceLink in PGo** | [paper](https://doi.org/10.1145/3763128), [author PDF](https://www.cs.ubc.ca/~bestchai/papers/oopsla25-trace-link.pdf), [PGo source](https://github.com/DistCompiler/pgo), [artifact](https://github.com/DistCompiler/tracelink-artifact), [Zenodo](https://doi.org/10.5281/zenodo.16926533) | PGo compiles Modular PlusCal to both TLA+ and Go. TraceLink auto-instruments the generated runtime, records read/write/commit/abort events with vector clocks, generates TLA+ interpretation code, and lets TLC explore causally permitted interpretations. | Strongest automation and treatment of distributed partial order. It found nine bugs across six categories, including a compiler bug. The vector-clock “sidestep” strategy avoids committing to lexical or timestamp order. | Tightly coupled to PGo-generated code and its uniform effect API; not a general TypeScript or OTel library. It cannot validate truncated/missing traces and cannot detect unmodeled factors or bugs that happen to produce an allowed observable trace. The artifact can require very large storage/compute. | PGo is Apache-2.0. The evaluation artifact is CC-BY-4.0. Both permit commercial use with their conditions/attribution. |
| **etcd-io/raft TLA+ trace validation** | [TLA directory](https://github.com/etcd-io/raft/tree/main/tla), [guide](https://github.com/etcd-io/raft/blob/main/tla/README.md) | Production Go Raft code exposes a `TraceLogger`; tagged builds record transition events. `Traceetcdraft.tla` reads NDJSON and TLC checks that the service trace follows the Raft model. | Real production-library integration, explicit transition log points, batch validation scripts, and a clear warning to disable log sampling. | Not OpenTelemetry. Its guide preserves causality by putting nodes on one machine and in one file, which does not generalize to arbitrary distributed deployment. Known issues include partial persistence and nonlinear validation time. | Apache-2.0; free for commercial use with notice requirements. |
| **MongoDB replication trace checker** | [`mongodb-labs/repl-trace-checker`](https://github.com/mongodb-labs/repl-trace-checker), [MongoDB TLA+ specification at the checker revision](https://github.com/mongodb/mongo/tree/8a4dba3b/src/mongo/db/repl/tla_plus/RaftMongo) | Parses specially instrumented MongoDB logs, reconstructs full specification states, generates a TLA+ module containing the concrete trace, and asks TLC whether the behavior is permitted. | Early concrete example of implementation-to-TLA+ trace checking against a production system. Straightforward architecture and useful generated-module pattern. | MongoDB-specific, not OTel, and last updated in 2020. Requires a historical MongoDB checkout and full-state reconstruction. | Apache-2.0; free for commercial use. Maintenance risk is high. |
| **Tlacuilo** | [`aburan28/tlacuilo`](https://github.com/aburan28/tlacuilo) | Current pure-Go TLA+ toolkit with builders, TLC execution, typed counterexample traces, ITF interchange, and a `tracecheck` package for validating annotated Go actions under a deterministic harness. | A reusable language-library shape rather than a one-off script. Includes ITF import/export and end-to-end TLC integration. | Go-specific and deterministic-harness oriented; not OTel or a production distributed-trace collector. Very new and lightly adopted. | Apache-2.0; free for commercial use. |
| **`tla-connect` for Rust and Elixir** | [Rust](https://github.com/sig-id/tla-connect-rs), [Elixir](https://github.com/sig-id/tla-connect-elixir) | Libraries combining Apalache/TLA+ with ITF replay, interactive symbolic tests, and implementation-to-spec NDJSON trace validation. | Their three-direction architecture—spec to implementation, interactive, and implementation to spec—is a useful API reference for an Effect module. | Young projects with small user bases. No OpenTelemetry path; callers still implement a state emitter and action/state mapping. Apalache/Java/solver tooling is an operational dependency. | Rust is MIT/Apache-2.0 dual licensed; Elixir is MIT. Free for commercial use under the selected license. |
| **Victoria** | [`kokjinsam/victoria`](https://github.com/kokjinsam/victoria) | Experimental Elixir library that loads committed ITF or invokes Apalache, replays formal actions against an implementation, and compares implementation snapshots with formal states. | Clean lifecycle contract (`init`, `execute`, `snapshot`, `project`, `cleanup`) that could inspire an Effect service interface. Can target processes, databases, or HTTP services. | Direction is primarily model-generated trace to implementation, not production OTel trace to model. Experimental 0.x API and narrow Apalache version support. | MIT; free for commercial use. |

## Quint, ITF, and model-based-testing ecosystem

| Project | Primary sources | What it contributes | Important limitation | License / cost |
|---|---|---|---|---|
| **ITF (Informal Trace Format)** | [ADR-015](https://apalache-mc.org/docs/adr/015adr-trace.html), [`itf-py`](https://github.com/konnov/itf-py), [`itf-rs`](https://github.com/informalsystems/itf-rs), [`itf-go`](https://github.com/informalsystems/itf-go) | A JSON representation of finite/lasso state traces. It defines variables, states, metadata, big integers, sets, tuples, maps, records, variants, and optional loop position. It is supported by Apalache and Quint. | ITF is a sequence of complete state objects, so a producer must choose a total order and materialize model state. It does not define how spans map to atomic actions or how completeness is established. | ITF-py is MIT; ITF Rust/Go libraries are Apache-2.0. Free for commercial use. |
| **Quint** | [repository](https://github.com/quint-co/quint), [ITF output documentation](https://quint.sh/docs/quint), [model-based testing](https://quint.sh/docs/model-based-testing) | Quint can simulate, test, and model-check specifications and emit ITF traces. | The standard CLI emits model traces; it does not itself turn arbitrary implementation/OTel traces into conformance verdicts. | Apache-2.0; free for commercial use. |
| **`quint-checktrace`** | [`Mimosa-Grove/quint-checktrace`](https://github.com/Mimosa-Grove/quint-checktrace) | Accepts an implementation-produced ITF trace and evaluates named Quint invariants against every recorded state, with human and machine reports. | It checks state invariants, not whether each adjacent state is admitted by the Quint next-state relation. A trace can consist entirely of invariant-satisfying states while containing an illegal transition. | AGPL-3.0-or-later. Commercial use is allowed, but distribution/network use may trigger source obligations; obtain legal review before embedding in proprietary services. No fee. |
| **Quint Connect** | [`quint-co/quint-connect`](https://github.com/quint-co/quint-connect), [design post](https://github.com/quint-co/quint/blob/main/docs/content/posts/quint_connect.mdx) | Generates ITF traces from a Quint model and replays actions against a Rust implementation, comparing states. | Opposite direction from production OTel trace validation. Its own roadmap/post identifies production trace validation as a future/third approach rather than an existing feature. | Apache-2.0; free for commercial use. |
| **Quint trace explorer** | [`quint-co/quint-trace-explorer`](https://github.com/quint-co/quint-trace-explorer) | TUI for inspecting Quint/Apalache ITF traces and state differences. | A viewer, not a validator or emitter; its README calls it a toy/vibe-coded project. No license file was present when checked, so reuse rights are unclear. | Source-visible but **commercial reuse status unverified** without an explicit license. |

## OpenTelemetry-specific adjacent work

| Project / paper | Primary sources | What it is | Pros | Cons / gap | License / cost |
|---|---|---|---|---|---|
| **Evaluating Design Conformance Through Trace Comparison** | [arXiv](https://arxiv.org/abs/2605.07909), [PDF](https://arxiv.org/pdf/2605.07909) | 2026 preprint that defines required/disallowed OpenTelemetry “design traces” and compares collected OTel traces against their span DAG, attributes, parent relations, and duration constraints. A .NET/Zipkin case study checked 100,000 traces and reported a conformance percentage. | The closest direct OTel prior art. Reuses ordinary auto-instrumented spans, tolerates additional spans, and uses parent/link structure rather than only a flat log. | It deliberately works without a formal specification or model checker. The check is pattern/conformance matching, not transition-system trace validation. The paper calls for more scalability work. No public implementation repository or software license was found. | Paper is publicly readable. The described implementation is not available for commercial reuse; reimplementation would be required. |
| **Tracetest** | [repository](https://github.com/kubeshop/tracetest), [documentation](https://docs.tracetest.io/), [license](https://github.com/kubeshop/tracetest/blob/main/LICENSE), [cloud EOL announcement](https://tracetest.io/blog/end-of-life-announcement-for-tracetest-cloud) | Trace-based integration/end-to-end testing over OpenTelemetry. Tests select spans and assert attributes, timing, relationships, and service behavior. | Mature OTel ingestion and a useful example of turning traces into CI verdicts. Could validate the telemetry contract before model checking. | Assertions are not a TLA+/Quint transition specification. Repository licensing is file-dependent: most core files default to MIT, while agent/cloud portions use the Tracetest Community License. Commercial hosted products ended; OSS continues. | OSS core is generally free/MIT, but inspect component-level licenses before commercial embedding. |
| **OpenTelemetry Weaver** | [repository](https://github.com/open-telemetry/weaver), [README](https://github.com/open-telemetry/weaver/blob/main/README.md) | Defines, validates, documents, and generates code for OpenTelemetry semantic conventions. | Good complementary tool for versioning and validating the proposed model-event schema and generating typed attribute constants. | Validates telemetry shape, not execution behavior or model conformance. | Apache-2.0; free for commercial use. |
| **OpenTelemetry Collector / file exporter** | [Collector](https://github.com/open-telemetry/opentelemetry-collector), [file exporter](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/exporter/fileexporter), [OTLP file format](https://opentelemetry.io/docs/specs/otel/protocol/file-exporter/) | Standard OTLP collection and file output. The file format is OTLP JSON, commonly JSON Lines. | A robust external capture boundary and vendor-neutral way to preserve raw traces before conversion. | OTLP JSON is not TLA+ NDJSON or ITF. A converter still needs semantic filtering, ordering, state reconstruction, and integrity checking. Collector queues/exporters may still lose data unless configured and monitored appropriately. | Apache-2.0; free for commercial use. Infrastructure/storage cost applies. |

## What OpenTelemetry and Effect provide for free

An Effect module should exploit the infrastructure that already exists rather
than build a separate tracing runtime.

### Effect-level benefits

1. **Layer wiring and lifecycle.** The current
   [`NodeSdk.layer`](https://github.com/Effect-TS/effect/blob/main/packages/opentelemetry/src/NodeSdk.ts)
   accepts one or more `SpanProcessor`s and handles provider acquisition,
   `forceFlush`, and shutdown. A model-trace processor can be installed beside a
   normal OTLP exporter through one application Layer.
2. **Fiber-local parent context.** Effect's tracer stores the current span in
   Effect context and `@effect/opentelemetry` keeps the OpenTelemetry context
   active while Effect primitives run. Application code does not need to manage
   Node `AsyncLocalStorage` manually.
3. **Structured instrumentation.** `Effect.withSpan` scopes span start/end to an
   Effect. `Effect.annotateCurrentSpan`, current-span access, span events, and
   links provide a standard place for model metadata.
4. **Error/interruption status.** The bridge records span status and errors, so
   rejected, failed, interrupted, and committed operations can be distinguished
   if the model schema says how.
5. **Test substitution.** An in-memory exporter can be supplied as a test Layer,
   while production uses OTLP, without changing domain call sites.

### OpenTelemetry-level benefits

1. **Causal graph.** Spans have at most one parent and may have links to other
   causally related spans ([OTel tracing API](https://opentelemetry.io/docs/specs/otel/trace/api/)).
   W3C trace context propagates IDs across process boundaries when the transport
   is instrumented.
2. **Standard event envelope.** A span event is a timestamp, name, and attribute
   map. Resource and instrumentation-scope metadata identify service and
   library versions.
3. **Existing exporters and collectors.** The same events can flow to an
   in-memory test exporter, an OTLP collector, a file, or an observability
   backend.
4. **Auto-instrumented context.** HTTP, database, messaging, and RPC spans can
   supply useful surrounding causality and debugging evidence.

“Zero-touch” only applies to transport and context wiring. OpenTelemetry cannot
infer which operation is a specification action, what the abstract state is, or
where the linearization point occurs. Those require deliberate application
instrumentation.

## The hard parts

### 1. Span order is not model-action order

TLA+ and ITF normally describe a sequence of states. OpenTelemetry describes a
DAG of overlapping intervals.

- Parent/child and link edges give a **partial causal order**.
- Sibling spans may be concurrent and unordered.
- Span start/end order is not commit order.
- Exporter arrival and batch order are not semantic order.
- Wall-clock timestamps across hosts are not a linearization mechanism.
- A `BatchSpanProcessor` can drop spans after its queue limit; the JS SDK
  documents that spans beyond `maxQueueSize` are dropped
  ([API](https://open-telemetry.github.io/opentelemetry-js/interfaces/_opentelemetry_sdk-trace.BatchSpanProcessorOptions.html)).

Recommended strategies, in order of simplicity:

1. **Per-aggregate commit sequence.** Allocate a gap-free `model.sequence`
   inside the same serialized state commit. Validate each aggregate separately.
2. **Global durable sequence.** Use a database log position/outbox sequence when
   the model genuinely requires a total cross-service order.
3. **Vector clocks / causal constraints.** For distributed models, add vector
   clocks and let TLC explore causally allowed linear extensions, as TraceLink
   does. OTel parents/links can seed edges but are not a complete vector clock.
4. **Do not totalize by timestamp.** At most use timestamps for diagnostics or
   deterministic tie-breaking after semantic constraints have established that
   either order is legal.

ITF needs one concrete state order. A partially ordered capture must therefore
be split by aggregate, assigned an explicit valid linearization, or expanded
into multiple candidate ITF traces. A TLA+ trace specification can instead
encode the partial-order constraints and ask TLC to find an admissible order.

### 2. A span is not necessarily an atomic specification action

Auto-instrumented spans are usually too low-level (SQL call) or too high-level
(whole HTTP request). Retries, nested spans, and long-running workflows further
break a one-span/one-action assumption.

The module should use a dedicated event or short child span at an explicit
linearization point:

```text
span name:   model.transition
 event name: model.transition.commit
 attributes:
   model.id
   model.version
   model.schema_version
   model.run_id
   model.aggregate_id
   model.sequence
   model.action
   model.action_args_json
   model.state_json or model.delta_json
   model.prev_state_hash
   model.state_hash
```

Rejected attempts may be useful telemetry, but they should be a different event
such as `model.transition.rejected`, not a state transition.

The mapping layer must document whether:

- one code commit corresponds to one specification action;
- multiple implementation steps are collapsed into one action;
- one concrete step may correspond to several abstract actions;
- stuttering/unobserved internal steps are allowed;
- action parameters are sufficient to disambiguate the transition.

This is the same “grain of atomicity” problem emphasized by the TLA+ trace
validation paper.

### 3. Standard processors/exporters do not stream events at the durable commit

A `SpanProcessor` has span start/end callbacks, not a callback for each newly
added event; a custom `SpanExporter` receives ended spans. If a model event is
attached to a long request span and the process crashes before that span ends,
the event may never reach the exporter even though the state committed.

For an in-process/test module:

- emit a **short dedicated transition span** that ends immediately after the
  commit event;
- make the commit-plus-event region uninterruptible where appropriate;
- force-flush before declaring a run complete;
- use `SimpleSpanProcessor` for deterministic test capture, not a lossy batch
  queue.

For production evidence, OpenTelemetry alone is insufficient for crash
atomicity. Prefer a transactional outbox containing the model event, then have
an exporter/collector translate that durable record into OTel and model-checker
formats. The OTel trace ID/span ID can still correlate the outbox record with
normal observability traces.

### 4. Sampling and completeness

The OTel SDK specifies that a `DROP` sampling decision makes a span
non-recording and drops all events/attributes
([SDK specification](https://opentelemetry.io/docs/specs/otel/trace/sdk/)). A
verification stream must therefore not use ordinary head/tail sampling.

Required integrity fields should include:

- run and aggregate IDs;
- contiguous commit sequence;
- initial-state identity/hash;
- previous and current state hash;
- model and schema version;
- explicit `model.run.complete` with expected final sequence/count;
- duplicate/gap detection and exporter acknowledgement.

A missing middle event is often detectable as a sequence gap. A missing final
event looks like a legal prefix unless a completion record says more events
were expected.

### 5. State snapshots are expensive and sensitive

The exporter must not read mutable domain state later. The application should
project an immutable abstract snapshot or delta at the commit point.

A clean interface is a pure adapter:

```ts
interface ModelProjection<DomainState, ModelState, Action> {
  readonly modelId: string
  readonly version: string
  project(state: DomainState): ModelState
  encodeAction(action: Action): { name: string; args: unknown }
}
```

Tradeoffs:

- **Full post-state:** easiest to emit as ITF and easiest to debug, but larger and
  more likely to contain sensitive data.
- **Deltas/selected variables:** smaller and compatible with the TLA+ trace
  validation framework, but the checker must reconstruct/infer state and may
  search much more.
- **Action only:** lowest overhead, weakest observation, and potentially large
  nondeterministic checker search.

The module needs a canonical encoder for `bigint`, sets, maps, tuples, records,
option types, and redacted identifiers. OTel attributes support a restricted
set of primitive/array values, so structured model values should normally be
canonical JSON strings or content-addressed blobs, not arbitrary nested
attribute objects. Attribute/event count and value-length limits must be raised
or checked explicitly.

### 6. Filtering ordinary spans

A model exporter must not infer semantics from span names such as `POST /jobs`.
Use an explicit contract:

- exact event name `model.transition.commit`;
- `model.trace = true`;
- instrumentation scope/package name;
- model/schema version;
- optionally a dedicated resource attribute and Collector pipeline.

The custom processor can scan only spans containing that event. OpenTelemetry
Weaver can define and validate the semantic convention. Auto-instrumented spans
remain useful as context, but do not become model transitions accidentally.

### 7. Trace IDs are not model-run IDs

One OTel trace usually follows one request. A state-machine run may span many
requests and trace IDs; one request may also mutate several aggregates. Group
and validate using explicit `model.run_id` and `model.aggregate_id`, while
retaining OTel trace/span IDs as causal/debug links.

## Proposed Effect module

A reusable design should separate the semantic API from capture and output:

```text
@effect/model-trace
  ModelTrace service
  action/state projection interfaces
  canonical value encoding
  sequence/completeness checks

@effect/model-trace-opentelemetry
  Effect span helpers
  ModelTraceSpanProcessor / ModelTraceSpanExporter
  NodeSdk Layer composition
  OTLP/Collector conventions

@effect/model-trace-formats
  TLA+ trace-validation NDJSON writer
  ITF JSON writer/reader
  raw canonical event archive

@effect/model-trace-checkers (optional)
  TLC process adapter
  Apalache/Quint adapter
  reports and artifact retention
```

An initial package could combine these, but the split keeps Java/model-checker
process management out of production application dependencies.

### Public API sketch

```ts
interface Transition<A, S> {
  readonly runId: string
  readonly aggregateId: string
  readonly sequence: bigint
  readonly action: A
  readonly state: S
  readonly previousStateHash?: string
}

interface ModelTraceService<A, S> {
  readonly commit: (transition: Transition<A, S>) => Effect.Effect<void>
  readonly complete: (runId: string, expectedFinalSequence: bigint) => Effect.Effect<void>
}
```

Usage should make the semantic transition explicit while leaving export wiring
in a Layer:

```ts
const program = Effect.gen(function*() {
  const result = yield* commitDomainTransition(command)
  yield* ModelTrace.commit({
    runId: result.runId,
    aggregateId: result.aggregateId,
    sequence: result.sequence,
    action: command,
    state: project(result.committedState)
  })
}).pipe(
  Effect.withSpan("model.transition", {
    attributes: { "model.id": "renewal-queue" }
  }),
  Effect.uninterruptible
)
```

The `ModelTrace.commit` implementation would access the current Effect span and
add a `model.transition.commit` event. A custom OTel exporter would read ended
transition spans, validate the event schema, and pass canonical records to one
or more writers.

### Layer sketch

The current Effect Node SDK accepts a processor or processor array, so the
model exporter can coexist with normal telemetry:

```ts
const ModelTelemetryLive = NodeSdk.layer(() => ({
  spanProcessor: [
    productionSpanProcessor,
    new SimpleSpanProcessor(new ModelTraceExporter(modelWriter))
  ],
  tracerConfig: {
    sampler: new AlwaysOnSampler()
  },
  resource: {
    serviceName: "worker",
    attributes: { "model.trace.schema": "1" }
  }
}))
```

Exact imports and configuration vary between Effect/OpenTelemetry major
versions; the design should compile against one pinned compatibility matrix.
The current Effect 4 source labels the Node SDK module unstable, so a small
compatibility wrapper is preferable to exposing its types throughout domain
code.

## Output formats

### Option A: TLA+ trace-validation NDJSON

Use this when the checker is a custom TLA+ trace specification based on
`trace_validation_tools`, etcd's approach, or the local experiment.

A tool-compatible event/delta line might look like:

```json
{"clock":42,"event":"Lease","event_args":["alice.eth","worker-a"],"phase":[{"op":"Update","path":["alice.eth"],"args":["leased"]}],"attempts":[{"op":"Update","path":["alice.eth"],"args":[1]}]}
```

Advantages:

- streamable and crash-tolerant at line boundaries;
- can record only selected updates/actions;
- TLC can infer omitted values or intermediate abstract steps.

Disadvantages:

- no universal schema across TLA+ projects;
- requires a project-specific trace specification and update operators;
- distributed ordering still needs a logical clock/vector clock;
- partial observations can increase checker search and ambiguity.

A simpler project may instead emit one full abstract post-state per line and
generate a TLA+ module that constrains `state[i] -> state[i+1]`, as the local
retry-queue experiment does.

### Option B: ITF JSON

Use this for Quint/Apalache tooling and generic state-trace viewers.

```json
{
  "#meta": {
    "source": "effect-opentelemetry",
    "model": "renewal-queue",
    "modelVersion": "abc123",
    "runId": "run-7",
    "varTypes": {
      "phase": "str -> str",
      "attempts": "str -> int"
    }
  },
  "vars": ["phase", "attempts"],
  "states": [
    {
      "#meta": {"index": 0, "action": "Init"},
      "phase": {"#map": [["alice.eth", "queued"]]},
      "attempts": {"#map": [["alice.eth", {"#bigint": "0"}]]}
    },
    {
      "#meta": {"index": 1, "action": "Lease", "sequence": "1"},
      "phase": {"#map": [["alice.eth", "leased"]]},
      "attempts": {"#map": [["alice.eth", {"#bigint": "1"}]]}
    }
  ],
  "loop": null
}
```

Advantages:

- documented state/value representation;
- existing Python, Rust, Go, TypeScript-viewer, Quint, and Apalache support;
- useful for committed fixtures and debugging.

Disadvantages:

- requires full state materialization and one total state order;
- action metadata in `#meta` is advisory unless the checker consumes it;
- `quint-checktrace` currently checks invariants per state, not transition
  admissibility, so full conformance needs an additional next-state check.

### Option C: preserve raw OTLP plus derived artifacts

The safest audit pipeline stores:

1. raw OTLP JSON/Protobuf evidence;
2. canonical filtered model events;
3. derived NDJSON and/or ITF;
4. checker command, tool/model versions, stdout/stderr, and verdict;
5. hashes connecting all artifacts.

This makes the trusted conversion step inspectable and lets a future converter
reprocess the original telemetry.

## Processor/exporter design

### In-process processor

A `SpanProcessor`/`SpanExporter` implementation should:

1. receive ended spans;
2. select only dedicated model events;
3. reject malformed, duplicate, mixed-version, or sampled/incomplete runs;
4. group by model/run/aggregate, not only OTel trace ID;
5. order by explicit sequence or preserve causal constraints;
6. write a raw canonical record immediately;
7. generate NDJSON/ITF on completion;
8. expose counters for accepted, rejected, duplicate, gap, overflow, and flush
   failure;
9. fail the test/CI run on evidence loss in strict mode.

A processor is convenient for tests and local replay. It should not block
normal request paths on TLC/Apalache. Checker invocation belongs after capture
or in a separate worker.

### Collector-side converter

For multi-service production use, an external Collector processor/exporter can:

- receive OTLP from all services;
- route model events separately from sampled observability data;
- preserve raw OTLP;
- group and integrity-check runs;
- write object storage or a durable queue;
- invoke conversion/checking asynchronously.

This reduces application coupling and centralizes schema rollout, but a custom
Collector component is normally written in Go and adds deployment/operational
work. It also cannot recover missing semantic action/state attributes.

### Durable outbox variant

For high-assurance evidence, make the source of truth a transactional model
outbox rather than the span exporter:

```text
domain transaction
  -> domain state
  -> model_outbox(sequence, action, projected_state, trace_id, span_id)

outbox relay
  -> OpenTelemetry event/log
  -> raw archive
  -> NDJSON/ITF
  -> model checker
```

This is the only proposed design that can make evidence durable and atomic with
an external database state transition. OpenTelemetry remains the correlation
and transport envelope.

## Validation semantics and guarantees

A successful result should be worded narrowly:

> The complete captured model-event trace for run R, after conversion C, is
> admitted by specification/model version M under checker configuration K.

It does not establish:

- correctness of executions that were not captured;
- correctness if events were sampled, truncated, reordered incorrectly, or
  projected wrongly;
- correctness of the instrumentation/converter/model;
- correctness of unmodeled I/O, timing, security, or resource behavior;
- universal implementation correctness.

The module should emit a report containing the guarantee boundary rather than a
bare green check.

## Feasibility and estimated work

### Minimal viable module: approximately 3–5 engineer-days

Given the existing repository experiment, an MVP could include:

- typed `ModelTrace` Effect service and Layer;
- short transition-span helper;
- in-memory/custom exporter;
- strict event schema and sequence checks;
- one full-state NDJSON writer;
- one ITF writer;
- fixture tests against TLC and Quint/Apalache tooling.

This is suitable for tests and controlled CI, not production evidence.

### Reusable open-source package: approximately 2–3 engineer-weeks

Additional work:

- pinned Effect/OTel compatibility matrix;
- stable public API and schema versioning;
- canonical ITF/TLA value codecs;
- pluggable action/state projections;
- raw evidence archive and deterministic conversion;
- checker subprocess adapters and reports;
- Weaver semantic-convention registry;
- property, interruption, concurrency, sampling, overflow, and mutation tests;
- documentation and examples for `Ref`, database transactions, queues, and RPC.

### Durable multi-service pipeline: approximately 4–8+ engineer-weeks

Additional work:

- outbox or equivalent durable event source;
- cross-service sequence/vector-clock strategy;
- Collector component or offline OTLP converter;
- completion/acknowledgement protocol;
- privacy/redaction and retention policy;
- operational dashboards and alerting for evidence loss;
- scale tests and model-checker workload controls;
- security and legal review.

The estimate grows substantially if the model has no clear aggregate boundary
or linearization points, because model/action mapping—not OpenTelemetry—is the
main engineering cost.

## Recommended first implementation

1. Build `@effect/model-trace-opentelemetry` as an MIT- or Apache-2.0-licensed
   test/CI package.
2. Start with **per-aggregate, gap-free commit sequences** and full post-state
   snapshots. Do not attempt arbitrary distributed partial-order validation in
   version 1.
3. Emit a short `model.transition` span per committed transition and a
   `model.run.complete` marker.
4. Use `SimpleSpanProcessor` plus an in-memory/file exporter in tests; disable
   sampling and fail closed on malformed or missing evidence.
5. Preserve raw canonical events, then generate both project-specific TLA+
   NDJSON and ITF JSON.
6. Validate TLA+ transition admissibility with TLC first. Treat
   `quint-checktrace` as an invariant checker unless/until a true Quint
   next-state trace checker is available.
7. Add Weaver definitions for the model-event attributes.
8. For production, move the event source to a transactional outbox before
   treating results as more than diagnostic evidence.

## Summary

No publicly discoverable Effect/OpenTelemetry-to-model-checker module was found.
The closest direct OTel work performs design-span pattern conformance, while the
closest formal work uses custom Java/Go/Rust/Elixir instrumentation and
NDJSON/ITF. Effect's Layer and fiber-aware tracer make the transport side
straightforward; the difficult and valuable work is defining atomic model
actions, projecting safe abstract state, establishing semantic order, and
proving trace completeness. A useful CI module is practical now. A trustworthy
production pipeline needs a durable outbox and explicit integrity protocol,
not just an OpenTelemetry exporter.
