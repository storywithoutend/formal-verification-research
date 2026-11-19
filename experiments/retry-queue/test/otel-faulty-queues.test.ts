import { isDeepStrictEqual } from "node:util"
import { Deferred, Effect, Either, Fiber } from "effect"
import fc from "fast-check"
import { describe, expect, it } from "vitest"
import {
  type AbstractState,
  type Command,
  applyCommand,
  initialState,
  validateTracePure
} from "../src/model.js"
import { captureSpans, spansToTrace } from "../src/otel-trace.js"
import {
  makeFaultyRenewalQueue,
  type QueueFault
} from "../src/queue-faulty.js"
import { validateTraceWithTlc } from "../src/tlc-trace.js"

const faults = [
  "non-atomic-lease",
  "duplicated-submission-on-retry",
  "stale-worker-failure-requeue",
  "off-by-one-retry-limit"
] as const satisfies readonly QueueFault[]

interface FaultRun {
  readonly customTrace: readonly AbstractState[]
  readonly spanTrace: readonly AbstractState[]
}

const sequentialCommands: Record<Exclude<QueueFault, "non-atomic-lease">, readonly Command[]> = {
  "duplicated-submission-on-retry": [
    { kind: "lease", job: "alice.eth", worker: "worker-a" },
    { kind: "retryable-failure", job: "alice.eth", worker: "worker-a" },
    { kind: "wake-retry", job: "alice.eth" },
    { kind: "lease", job: "alice.eth", worker: "worker-b" },
    { kind: "submit", job: "alice.eth", worker: "worker-b" }
  ],
  "stale-worker-failure-requeue": [
    { kind: "lease", job: "alice.eth", worker: "worker-a" },
    { kind: "retryable-failure", job: "alice.eth", worker: "worker-a" },
    { kind: "wake-retry", job: "alice.eth" },
    { kind: "lease", job: "alice.eth", worker: "worker-b" },
    { kind: "retryable-failure", job: "alice.eth", worker: "worker-a" }
  ],
  "off-by-one-retry-limit": [
    { kind: "lease", job: "alice.eth", worker: "worker-a" },
    { kind: "retryable-failure", job: "alice.eth", worker: "worker-a" },
    { kind: "wake-retry", job: "alice.eth" },
    { kind: "lease", job: "alice.eth", worker: "worker-b" },
    { kind: "retryable-failure", job: "alice.eth", worker: "worker-b" },
    { kind: "lease", job: "alice.eth", worker: "worker-a" }
  ]
}

const runFault = async (fault: QueueFault): Promise<FaultRun> => {
  if (fault === "non-atomic-lease") {
    const captured = await Effect.runPromise(
      captureSpans(
        Effect.gen(function*() {
          const firstRead = yield* Deferred.make<void>()
          const secondRead = yield* Deferred.make<void>()
          const release = yield* Deferred.make<void>()
          const queue = yield* makeFaultyRenewalQueue(fault, {
            beforeStaleLeaseWrite: (command) =>
              Deferred.succeed(
                "worker" in command && command.worker === "worker-a" ? firstRead : secondRead,
                undefined
              ).pipe(Effect.zipRight(Deferred.await(release)))
          })
          const first = yield* queue.execute({
            kind: "lease",
            job: "alice.eth",
            worker: "worker-a"
          }).pipe(Effect.fork)
          yield* Deferred.await(firstRead)
          const second = yield* queue.execute({
            kind: "lease",
            job: "alice.eth",
            worker: "worker-b"
          }).pipe(Effect.fork)
          yield* Deferred.await(secondRead)
          yield* Deferred.succeed(release, undefined)
          yield* Fiber.join(first)
          yield* Fiber.join(second)
          return yield* queue.trace
        })
      )
    )
    return { customTrace: captured.value, spanTrace: spansToTrace(captured.spans) }
  }

  const captured = await Effect.runPromise(
    captureSpans(
      Effect.gen(function*() {
        const queue = yield* makeFaultyRenewalQueue(fault)
        for (const command of sequentialCommands[fault]) yield* queue.execute(command)
        return yield* queue.trace
      })
    )
  )
  return { customTrace: captured.value, spanTrace: spansToTrace(captured.spans) }
}

const fastCheckPropertyForFault = (fault: QueueFault): fc.IAsyncProperty<unknown> =>
  fc.asyncProperty(fc.constant(null), async () => {
    if (fault === "non-atomic-lease") {
      const outcomes = await Effect.runPromise(
        Effect.gen(function*() {
          const firstRead = yield* Deferred.make<void>()
          const secondRead = yield* Deferred.make<void>()
          const release = yield* Deferred.make<void>()
          const queue = yield* makeFaultyRenewalQueue(fault, {
            beforeStaleLeaseWrite: (command) => Deferred.succeed(
              "worker" in command && command.worker === "worker-a" ? firstRead : secondRead,
              undefined
            ).pipe(Effect.zipRight(Deferred.await(release)))
          })
          const first = yield* queue.execute({
            kind: "lease",
            job: "alice.eth",
            worker: "worker-a"
          }).pipe(Effect.either, Effect.fork)
          yield* Deferred.await(firstRead)
          const second = yield* queue.execute({
            kind: "lease",
            job: "alice.eth",
            worker: "worker-b"
          }).pipe(Effect.either, Effect.fork)
          yield* Deferred.await(secondRead)
          yield* Deferred.succeed(release, undefined)
          return [yield* Fiber.join(first), yield* Fiber.join(second)] as const
        })
      )
      return outcomes.filter(Either.isRight).length === 1
    }

    const queue = await Effect.runPromise(makeFaultyRenewalQueue(fault))
    const commands = sequentialCommands[fault]
    let expected = initialState()
    for (const command of commands) {
      try {
        expected = applyCommand(expected, command)
      } catch {
        const outcome = await Effect.runPromise(queue.execute(command).pipe(Effect.either))
        return Either.isLeft(outcome)
      }
      const outcome = await Effect.runPromise(queue.execute(command).pipe(Effect.either))
      if (Either.isLeft(outcome)) return false
      const actual = await Effect.runPromise(queue.snapshot)
      if (!isDeepStrictEqual(actual, expected)) return false
    }
    return true
  })

describe("real faulty queue variants through span validation", () => {
  it.each(faults)("trace validation catches %s", async (fault) => {
    const run = await runFault(fault)
    expect(run.spanTrace).toEqual(run.customTrace)
    expect(validateTracePure(run.spanTrace).ok).toBe(false)
    const tlc = await validateTraceWithTlc(run.spanTrace, `otel-code-fault-${fault}`)
    expect(tlc.ok).toBe(false)
  }, 30_000)

  it.each(faults)("targeted fast-check property catches %s", async (fault) => {
    const result = await fc.check(
      fastCheckPropertyForFault(fault),
      { numRuns: 3, seed: 20_261_119 }
    )
    expect(result.failed).toBe(true)
  }, 30_000)
})
