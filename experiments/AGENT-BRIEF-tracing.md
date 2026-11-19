# Experiment 2: trace validation from Effect's built-in tracing

Same hard rules as experiments/AGENT-BRIEF.md (public repo, no secrets, no private repos, work only here, project-local installs, commit + push small steps to main, never claim proof of the implementation).

## Question
Can the TLA+ trace validation in experiments/retry-queue/ be driven entirely by Effect's built-in observability (Effect.withSpan, span events/annotations, Tracer, @effect/opentelemetry with an in-memory exporter) instead of the custom transition log?

## Do
1. Instrument src/queue.ts so each abstract step is recorded through Effect tracing: inside the same atomic Ref.modify that commits the state, take a sequence number and record action, job, worker and the new abstract state as a span event/attributes.
2. Export spans with an in-memory OpenTelemetry exporter (no sampling) and write a converter from exported spans to the trace format the TLC replay already accepts. Run the existing TLC replay and TS replay on it.
3. Compare against the custom log: does a span-derived trace match the custom trace step for step on the same seeds?
4. Test the failure modes and record what happens:
   - ordering by span timestamps instead of sequence number with concurrent fibers;
   - recording at span start/end instead of at commit;
   - sampling / dropped events (e.g. 50% sampler, or drop one event);
   - fiber interruption/cancellation mid-step.
5. Planted bugs IN THE CODE this time (not hand-written traces): add real faulty variants of src/queue.ts (non-atomic lease via get-then-set, duplicated submission on retry, stale worker failure requeue, off-by-one retry limit), run them under the span-based pipeline, and record which are caught by trace validation vs fast-check vs neither.
6. Write experiments/retry-queue-otel/README.md (or a section in retry-queue) with how to run, results table, and an honest verdict: is built-in observability enough, what extra conventions are required, and what remains unverified.

When done, update experiments/STATUS.md with a new section and stop.
