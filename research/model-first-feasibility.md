# Feasibility of model-first TypeScript / Effect development

Assessment date: 2026-11-19. Evidence and source validation are in
[`model-first-evidence.md`](./model-first-evidence.md). The measured prototype is
[`experiments/retry-queue/`](../experiments/retry-queue/).

## Executive assessment

**Feasible now, with a layered guarantee and a deliberately small model-to-code
interface.** For concurrent TypeScript / Effect workflows, the practical path is:

1. model the abstract state machine in TLA+;
2. exhaust small finite configurations with TLC and, where useful, bounded
   symbolic configurations with Apalache;
3. implement atomic abstract transitions in Effect;
4. log every abstract transition with enough state and action identity to replay;
5. ask TLC whether observed traces are behaviors of the model;
6. generate sampled command sequences with fast-check; and
7. mutation-test the implementation adapter and targeted pure logic.

This gives substantially stronger and more diagnosable evidence than ordinary
example tests alone. It does **not** produce a mathematical proof that deployed
JavaScript, the Node/browser scheduler, npm dependencies, RPC providers, or the
external environment implement the model.

A verified-intermediate-representation route is also technically plausible for
small pure functions: generate Dafny/Lean/Verus first, verify the formal source,
then translate or compile. It is **not yet a credible general replacement** for
hand-written TypeScript/Effect workflows. No reviewed source in the evidence set
provides a proof-preserving TypeScript backend covering Effect fibers, promises,
Node/browser I/O, and npm packages.

## What the prototype established

The retry-queue experiment models two concurrent ENS-flavored renewal jobs, two
workers, transient/permanent failures, deterministic backoff, and at most two
attempts.

| Layer | Measured result | Correct interpretation |
|---|---|---|
| TLC | Complete graph: 495 distinct states, depth 13; all invariants passed | Every reachable state in this configured finite abstract model satisfies the invariants. |
| TLA+ model mutation | Four deliberate bad actions each produced the intended invariant counterexample | The selected invariants are sensitive to these four modeled fault classes. |
| Apalache | Seven invariants passed through 12 symbolic transitions | No bounded counterexample was found through that length; this was not an inductive proof. |
| Effect implementation | One atomic `Ref.modify` updates state and trace; deterministic `TestClock` test passed | The tested adapter serializes its in-memory transition and can be replayed deterministically. |
| fast-check | 200 fixed-seed model-based runs | Sampled legal command sequences kept the TS implementation equal to the executable model. |
| TLC trace replay | Good trace accepted; four planted bad traces rejected | Those five observed traces were classified against the TLA+ `AllowedStep` relation. |
| Stryker | Six of six runtime-valid adapter mutants killed; 35 additional mutants rejected by the TS checker | The selected tests distinguished the runnable mutations in `src/queue.ts`; the denominator is small and targeted. |

The experiment also exposed useful negative findings:

- legal-command model-based tests do not automatically generate stale or illegal
  commands;
- random command sequences are not a substitute for adversarial schedule
  exploration;
- a high mutation percentage can hide a small runtime-valid denominator;
- an abstract “submit once” transition does not solve atomicity between a real
  RPC and durable local state.

## Feasibility by concern

### TLA+ and PlusCal as the starting model

**Fit: high for workflows, low for implementation detail.** TLA+ naturally
expresses ownership, retries, cancellation, idempotency, ordering, and
interleavings. PlusCal can make a worker algorithm easier to read, but a direct
line-by-line mapping to TypeScript should not be expected. The useful mapping is
architectural:

- TLA+ variable → compact abstract application state;
- TLA+ action → one atomic application transition or protocol boundary;
- environment action → injected service result, timer, RPC response, wallet
  response, or user event;
- invariant → model check plus runtime/test assertion;
- fairness assumption → explicit operational assumption, never silently treated
  as a code guarantee.

TLC can exhaust a finite model when constants and data domains are small. The
main costs are abstraction work and state-space growth, not runtime on toy
models. The prototype’s complete TLC run took about one second.

### Apalache

**Fit: medium and complementary.** Apalache installed cleanly and checked the
prototype, but required type annotations and a compatibility feature flag for
legacy record types. Its bounded run took about 43 seconds, much longer than TLC
on this tiny finite state space. It becomes more attractive when SMT reasoning
avoids explicit combinatorial enumeration or when checking candidate inductive
invariants. It should not be added merely to duplicate a small TLC run.

### Effect TS implementation

**Fit: high if abstract transitions are centralized.** Useful Effect mechanisms
include:

- `Ref.modify` for one in-process atomic state/trace update;
- fibers for controlled concurrency;
- `TestClock` for deterministic time;
- service/layer injection for deterministic outcomes, IDs, randomness, storage,
  RPCs, and wallet operations;
- typed errors for rejected transitions.

The implementation should avoid scattering abstract state changes across
callbacks and services. A single transition API makes the model mapping,
logging, property tests, and mutation analysis tractable.

**Boundary:** an Effect `Ref` only gives process-local atomicity. Durable
workflows need a database transaction, compare-and-swap, lease token/fencing
number, or outbox/idempotency protocol. Those mechanisms must appear in the
model if they carry safety.

### Deterministic time and randomness

**Fit: high.** The prototype uses `TestClock` and explicit outcome inputs rather
than ambient randomness. For production-scale tests:

- wrap clock, random, UUID, network, wallet, and persistence access in injected
  services;
- record the chosen abstract outcome in the trace;
- preserve fast-check seed/path for replay;
- separately test the production service adapters.

A deterministic test runtime improves reproducibility but does not prove that
the real scheduler or provider behaves the same way.

### Trace validation

**Fit: medium-high, but bespoke.** The prototype demonstrates a small viable
TypeScript adapter: JSON states are rendered into a generated TLA+ module, and
TLC checks every adjacent pair with the same `AllowedStep` relation used by the
model checker.

Required instrumentation:

1. stable workflow/run ID;
2. monotonic event sequence number;
3. action kind and actor identity;
4. pre/post abstract state, or enough updates to reconstruct them;
5. idempotency/fencing token when external effects are involved;
6. model version and abstraction-schema version;
7. explicit markers for events intentionally hidden by the abstraction.

The hardest design decision is **atomicity grain**. If one TLA+ action corresponds
to three separately logged TypeScript operations, valid code may appear to
violate the model. If logging combines too much, intermediate races disappear.
This mapping needs review and fault fixtures, not only code generation.

Trace validation checks observed executions. It cannot establish correctness of
unobserved schedules, dropped logs, incorrect instrumentation, or an overly
permissive model.

### fast-check and model-based testing

**Fit: high for sampled data/command exploration.** `fc.commands` and
`asyncModelRun` map cleanly to an Effect service. They provide seeds, shrinking,
and a familiar TypeScript workflow.

Limitations found in the experiment:

- `check` preconditions filter illegal commands, so stale requests and malformed
  events need separate negative-command generators;
- command model runs are sequential unless scheduling is also generated;
- the executable TS model can share a bug with the implementation;
- a TLA+ counterexample is not automatically a fast-check command sequence
  without a translation layer.

A stronger setup should have three generators: legal commands, adversarial
illegal/stale commands, and controlled schedules/faults.

### Stryker

**Fit: high as a test-strength diagnostic, with careful reporting.** The
prototype’s targeted adapter score reached 100%, but only six runtime-valid
mutants were in the denominator after the TypeScript checker rejected 35. A
production report should always include killed, survived, no-coverage,
type-invalid/error counts, target files, and operators—not only the percentage.

Stryker complements but does not replace deliberate domain faults. Generic
operator mutation did not directly instantiate the four concurrency/protocol
faults in the experiment.

### Verified intermediate representations

**Fit now: low-medium for pure cores; low for whole Effect applications.** The
sources show successful verifier-in-the-loop generation in Dafny, Lean, Verus,
Rocq/VST, and ACSL. The verified artifact is still relative to its formal
contract. For TypeScript deployment, remaining work includes:

- a semantics for the supported TypeScript subset;
- a proof-preserving or independently validated compiler/backend;
- treatment of JavaScript numbers, exceptions, mutation, async scheduling, and
  module/FFI boundaries;
- trustworthy bindings for Effect and external services;
- source maps from generated code to the verified IR;
- differential tests against the IR as an executable oracle.

Dafny’s JavaScript backend can be experimentally useful, but compilation to
JavaScript is not the same as a verified TypeScript backend, and generated type
declarations do not close the runtime gap.

### AI coding agents

**Fit: high for mechanics; medium-low for independent specification authority.**
Agents are useful for:

- TLA+ syntax, type annotations, configs, and repetitive action definitions;
- translating counterexamples into tests;
- generating adapters and trace serializers;
- running deterministic tools and preserving machine-readable evidence;
- proposing mutants and maintaining mapping tables.

Agents should not be allowed to silently weaken invariants or add assumptions
after a counterexample. Human review remains necessary for requirement meaning,
atomicity boundaries, fairness, external assumptions, and whether witness/fault
cases are representative.

## Recommended production architecture

```text
requirements.md
      |
      v
model/Workflow.tla + finite configs + model mutants
      | TLC/Apalache evidence
      v
abstract-transition.schema.json
      | generated/shared TS types where practical
      v
src/workflow/transition.ts   (single atomic abstract transition boundary)
      |
      +--> Effect services: Clock, Random, Store, RPC, Wallet
      |
      +--> append-only abstract trace with model/schema version
      |
      +--> fast-check command adapter and negative-command generators
      |
      +--> TLC trace replay in CI/nightly/incident tooling
```

Keep the TLA+ transition relation authoritative for concurrency semantics. The
TypeScript executable model may optimize test speed, but every release should
replay representative traces through TLC so a shared TS-model bug is not the
only oracle.

## Minimal prototype plan for a real repository

### Repository structure

```text
verification/<workflow>/
  requirements.md
  model/
    Workflow.tla
    Workflow.cfg
    WorkflowFaults.tla
    Fault*.cfg
    TraceReplay.tla
  schema/
    abstract-state.schema.json
    abstract-event.schema.json
  adapter/
    render-trace-to-tla.ts
    validate-trace.ts
  tests/
    model-based.test.ts
    schedule.test.ts
    fault-fixtures.test.ts
  results/
    tlc-summary.md
    trace-summary.md
    mutation-summary.md
  verify.sh
src/<workflow>/
  transition.ts
  services.ts
```

### Scope

Choose one workflow with:

- 2–4 abstract entities;
- 2 actors or tabs/workers;
- one retry/backoff;
- one external effect with an idempotency key;
- cancellation or stale-response behavior;
- two high-value safety invariants and one progress expectation.

Do not begin with a whole React application or general RPC client.

### Work sequence

1. Write the English state/action table and assumptions.
2. Write TLA+ `Init`, pure `AllowedStep(from,to)`, `Next`, and invariants.
3. Add witness traces and at least four model mutants before implementation.
4. Complete TLC for agreed constants; add Apalache only for a distinct symbolic
   question.
5. Freeze/version the abstract state/event schema.
6. Implement one Effect transition boundary and injected services.
7. Emit a trace from the first integration test and replay it through TLC.
8. Add fast-check legal, illegal/stale, and schedule generators.
9. Run Stryker on the transition adapter and report the actual denominator.
10. Compare faults, runtime, maintenance changes, and failures against the
    existing conventional suite.

### Acceptance criteria

- TLC completes with zero states left on queue for the agreed finite configs.
- Every action expected in scope has non-zero coverage.
- Each model mutant fails for its intended invariant, not a parse/type error.
- At least one satisfying and one violating trace exists per safety property.
- The implementation logs every abstract state-changing action with model and
  schema versions.
- TLC accepts the good integration trace and rejects each bad trace fixture.
- fast-check records seed/path and exercises legal plus stale/illegal commands.
- deterministic clock/random/service tests have no wall-clock sleeps or live
  network calls.
- Stryker has no unexplained surviving mutant in the selected critical adapter;
  score denominator and type-invalid count are reported.
- Documentation explicitly states that no implementation proof has been made.

## Expected cost and performance

The experiment’s steady-state checks were inexpensive:

- TLC complete finite model: about 1 second;
- Vitest, including five TLC trace replays: about 3.5 seconds;
- Apalache bounded check: about 43 seconds;
- targeted Stryker run: about 16 seconds;
- first-time local tool downloads: roughly 190 MB JDK plus 183 MB Apalache and
  npm dependencies.

The dominant engineering cost is not checker runtime. It is agreeing on the
abstraction, constructing faithful fault cases, maintaining the event mapping,
and changing the model and implementation together when requirements evolve.

For a first real workflow, budget a few focused engineer-days rather than
assuming model generation is free. After the schema/adapter pattern exists,
similar workflows should be cheaper. This estimate is a planning judgment from
the prototype, not a source-backed industry benchmark.

## Comparison with a conventional testing baseline

A fair comparison should run the same four domain faults against:

1. existing example/unit/integration tests only;
2. deterministic Effect tests;
3. fast-check model-based tests;
4. TLA+ model checks and model mutants;
5. TLC trace replay; and
6. Stryker.

Measure detection, diagnosis time, false positives, runtime, and maintenance
changes. The prototype already indicates the likely division of labor:

- TLC is strongest for bounded interleavings and invariant counterexamples;
- deterministic tests are strongest for adapters and timing behavior;
- trace replay is strongest for observed model/code discrepancies;
- fast-check is strongest for broad sampled command/data variation;
- Stryker is strongest for revealing weak assertions in code already under test.

## Open questions

### Specification and refinement

- Which requirements deserve safety invariants, action properties, or liveness?
- How will non-vacuity be demonstrated for every guarded property?
- Can the abstract model be split into a stable contract and a lower-level
  implementation model with a checked refinement mapping?
- Who approves a property weakening or new environment assumption?

### TypeScript / Effect semantics

- What is the exact atomic unit: an Effect transaction, database transaction,
  state reducer call, queue message, or logged span?
- How should interruption, defects, fiber cancellation, scopes, retries, and
  resource finalizers appear in the model?
- Can schedule generation cover the important Effect fiber interleavings without
  depending on undocumented runtime behavior?
- Which uses of JavaScript number, `Date`, exceptions, mutation, and promises
  need explicit abstraction rules?

### External side effects

- What idempotency and fencing guarantees do wallet/RPC/provider APIs actually
  supply?
- Can a durable outbox and submission receipt be modeled and tested without
  logging secrets or user data?
- How are chain reorgs, replacement transactions, partial receipts, timeouts,
  and provider disagreement represented?
- Which environment assumptions can be monitored in production rather than
  merely written as `ASSUME`?

### Trace integrity

- How are dropped, duplicated, reordered, or sampled logs detected?
- Should traces contain full abstract states, deltas, or both?
- How are schema/model upgrades handled for in-flight workflows?
- Can production traces be minimized and anonymized while retaining enough
  information for replay?
- What independent test checks that instrumentation reports the real state
  rather than a convenient reconstruction?

### Verified IR and compilation

- Is a restricted, generated TypeScript subset worth formalizing, or is
  differential testing against a verified Dafny/Lean oracle more economical?
- Which proof obligations survive a JavaScript backend and bundling/minification?
- Could WebAssembly from a verified source language provide a smaller bridge for
  pure cores?
- What compiler/runtime/environment components enter the trusted computing base?

### Agent workflow

- How should verifier files be frozen or reviewed so an implementation agent
  cannot “fix” a counterexample by weakening the spec?
- Can agents reliably generate non-trivial liveness/action properties, or should
  their role remain syntax and counterexample assistance?
- What structured result format should capture bounds, versions, seeds, traces,
  mutation denominator, assumptions, and residual risks?
- When should an agent stop and file a spec-change request instead of changing
  code or model?

## Recommendation

Proceed with one real, bounded workflow pilot using the architecture and
acceptance criteria above. Treat TLA+ as the concurrency/design oracle, Effect as
the deterministic implementation framework, TLC trace replay as the model/code
bridge, and fast-check/Stryker as complementary test-strength tools.

Do not claim implementation correctness. The credible claim after a successful
pilot is narrower: the finite model satisfies its checked properties; selected
model mutants are rejected; sampled implementation commands agree with the
executable model; and selected observed implementation traces are admitted by
the TLA+ transition relation.
