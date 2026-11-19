import type { Sampler } from "@opentelemetry/sdk-trace-base"
import { SamplingDecision, type ReadableSpan } from "@opentelemetry/sdk-trace-base"
import { Deferred, Effect, Fiber } from "effect"
import { describe, expect, it } from "vitest"
import { type AbstractState, type Command, validateTracePure } from "../src/model.js"
import { captureSpans, spansToTrace, tracesMatch } from "../src/otel-trace.js"
import { makeRenewalQueue, type TraceEventPlacement } from "../src/queue.js"
import { validateTraceWithTlc } from "../src/tlc-trace.js"

const leaseAlice: Command = { kind: "lease", job: "alice.eth", worker: "worker-a" }
const leaseBob: Command = { kind: "lease", job: "bob.eth", worker: "worker-b" }

const dropSequence = (spans: readonly ReadableSpan[], sequence: number): readonly ReadableSpan[] =>
  spans.map((span) => ({
    ...span,
    events: span.events.filter((event) => event.attributes?.["retry_queue.sequence"] !== sequence)
  }))

const alternatingHalfSampler = (): Sampler => {
  let index = 0
  return {
    shouldSample: () => ({
      decision: index++ % 2 === 0
        ? SamplingDecision.RECORD_AND_SAMPLED
        : SamplingDecision.NOT_RECORD
    }),
    toString: () => "DeterministicAlternating50PercentSampler"
  }
}

const interruptedStep = (placement: TraceEventPlacement) =>
  captureSpans(
    Effect.gen(function*() {
      const entered = yield* Deferred.make<void>()
      const block = () => Deferred.succeed(entered, undefined).pipe(
        Effect.zipRight(Effect.never)
      )
      const queue = yield* makeRenewalQueue({
        traceEventPlacement: placement,
        ...(placement === "span-start" ? { beforeCommit: block } : {}),
        ...(placement === "span-end" || placement === "commit" ? { afterCommit: block } : {})
      })
      const fiber = yield* queue.execute(leaseAlice).pipe(Effect.fork)
      yield* Deferred.await(entered)
      yield* Fiber.interrupt(fiber)
      return yield* queue.trace
    })
  )

const interruptCommitBeforeStateChange = () =>
  captureSpans(
    Effect.gen(function*() {
      const entered = yield* Deferred.make<void>()
      const queue = yield* makeRenewalQueue({
        beforeCommit: () => Deferred.succeed(entered, undefined).pipe(
          Effect.zipRight(Effect.never)
        )
      })
      const fiber = yield* queue.execute(leaseAlice).pipe(Effect.fork)
      yield* Deferred.await(entered)
      yield* Fiber.interrupt(fiber)
      return yield* queue.trace
    })
  )

const runSuccessfulTrace = () =>
  captureSpans(
    Effect.gen(function*() {
      const queue = yield* makeRenewalQueue()
      const commands: readonly Command[] = [
        leaseAlice,
        { kind: "retryable-failure", job: "alice.eth", worker: "worker-a" },
        { kind: "wake-retry", job: "alice.eth" },
        { kind: "lease", job: "alice.eth", worker: "worker-b" },
        { kind: "submit", job: "alice.eth", worker: "worker-b" },
        { kind: "confirm", job: "alice.eth" }
      ]
      for (const command of commands) yield* queue.execute(command)
      return yield* queue.trace
    })
  )

describe("OpenTelemetry trace failure modes", () => {
  it("requires commit sequence, not event timestamps, under concurrent fibers", async () => {
    const captured = await Effect.runPromise(
      captureSpans(
        Effect.gen(function*() {
          const aliceReached = yield* Deferred.make<void>()
          const releaseAlice = yield* Deferred.make<void>()
          const queue = yield* makeRenewalQueue({
            beforeCommit: (command) => command.job === "alice.eth"
              ? Deferred.succeed(aliceReached, undefined).pipe(
                  Effect.zipRight(Deferred.await(releaseAlice))
                )
              : Effect.void
          })
          const aliceFiber = yield* queue.execute(leaseAlice).pipe(Effect.fork)
          yield* Deferred.await(aliceReached)
          yield* Effect.sleep("1 millis")
          yield* queue.execute(leaseBob)
          yield* Deferred.succeed(releaseAlice, undefined)
          yield* Fiber.join(aliceFiber)
          return yield* queue.trace
        })
      )
    )

    const bySequence = spansToTrace(captured.spans)
    const byTimestamp = spansToTrace(captured.spans, {
      order: "timestamp",
      requireContiguousSequence: false
    })
    expect(bySequence).toEqual(captured.value)
    expect(tracesMatch(byTimestamp, captured.value)).toBe(false)
    expect(validateTracePure(byTimestamp).ok).toBe(false)
    const tlc = await validateTraceWithTlc(byTimestamp, "otel-timestamp-order")
    expect(tlc.ok).toBe(false)
  }, 30_000)

  it("span-start recording can emit a valid phantom transition before cancellation", async () => {
    const captured = await Effect.runPromise(interruptedStep("span-start"))
    const spanTrace = spansToTrace(captured.spans)
    expect(captured.value).toHaveLength(1)
    expect(spanTrace).toHaveLength(2)
    expect(validateTracePure(spanTrace)).toEqual({ ok: true })
    expect((await validateTraceWithTlc(spanTrace, "otel-span-start-phantom")).ok).toBe(true)
    expect(tracesMatch(spanTrace, captured.value)).toBe(false)
  }, 30_000)

  it("span-end recording loses a committed transition when cancellation wins", async () => {
    const captured = await Effect.runPromise(interruptedStep("span-end"))
    const spanTrace = spansToTrace(captured.spans)
    expect(captured.value).toHaveLength(2)
    expect(spanTrace).toHaveLength(1)
    expect(validateTracePure(spanTrace)).toEqual({ ok: true })
    expect((await validateTraceWithTlc(spanTrace, "otel-span-end-missing")).ok).toBe(true)
    expect(tracesMatch(spanTrace, captured.value)).toBe(false)
  }, 30_000)

  it("commit recording emits nothing when cancellation wins before the state update", async () => {
    const captured = await Effect.runPromise(interruptCommitBeforeStateChange())
    const spanTrace = spansToTrace(captured.spans)
    expect(captured.value).toHaveLength(1)
    expect(spanTrace).toEqual(captured.value)
  })

  it("commit recording survives cancellation after the atomic state update", async () => {
    const captured = await Effect.runPromise(interruptedStep("commit"))
    const spanTrace = spansToTrace(captured.spans)
    expect(spanTrace).toEqual(captured.value)
    expect(validateTracePure(spanTrace)).toEqual({ ok: true })
  })

  it("a deterministic 50% sampler creates sequence gaps", async () => {
    const baseProgram = Effect.gen(function*() {
      const queue = yield* makeRenewalQueue()
      yield* queue.execute(leaseAlice)
      yield* queue.execute({ kind: "submit", job: "alice.eth", worker: "worker-a" })
      yield* queue.execute({ kind: "confirm", job: "alice.eth" })
      yield* queue.execute(leaseBob)
      yield* queue.execute({ kind: "submit", job: "bob.eth", worker: "worker-b" })
      yield* queue.execute({ kind: "confirm", job: "bob.eth" })
      return yield* queue.trace
    })
    const captured = await Effect.runPromise(
      captureSpans(baseProgram, { sampler: alternatingHalfSampler() })
    )
    expect(() => spansToTrace(captured.spans)).toThrow(/expected transition sequence/)
    const partial = spansToTrace(captured.spans, { requireContiguousSequence: false })
    expect(validateTracePure(partial).ok).toBe(false)
    expect((await validateTraceWithTlc(partial, "otel-half-sampled")).ok).toBe(false)
  }, 30_000)

  it("detects a dropped middle event by sequence gap and model replay", async () => {
    const captured = await Effect.runPromise(runSuccessfulTrace())
    const dropped = dropSequence(captured.spans, 3)
    expect(() => spansToTrace(dropped)).toThrow("expected transition sequence 3, got 4")
    const partial = spansToTrace(dropped, { requireContiguousSequence: false })
    expect(validateTracePure(partial).ok).toBe(false)
    expect((await validateTraceWithTlc(partial, "otel-drop-middle")).ok).toBe(false)
  }, 30_000)

  it("cannot detect a dropped final event without an external completion count", async () => {
    const captured = await Effect.runPromise(runSuccessfulTrace())
    const finalSequence = captured.value.length - 1
    const truncated = spansToTrace(dropSequence(captured.spans, finalSequence))
    expect(truncated).toHaveLength(captured.value.length - 1)
    expect(validateTracePure(truncated)).toEqual({ ok: true })
    expect((await validateTraceWithTlc(truncated, "otel-drop-final")).ok).toBe(true)
    expect(tracesMatch(truncated, captured.value)).toBe(false)
  }, 30_000)
})
