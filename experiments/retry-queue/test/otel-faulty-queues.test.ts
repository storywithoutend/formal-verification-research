import { Deferred, Effect, Fiber } from "effect"
import fc from "fast-check"
import { describe, expect, it } from "vitest"
import { type AbstractState, type Command, validateTracePure } from "../src/model.js"
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
      fc.asyncProperty(fc.constant(fault), async (selectedFault) => {
        const run = await runFault(selectedFault)
        return validateTracePure(run.spanTrace).ok
      }),
      { numRuns: 3, seed: 20_261_119 }
    )
    expect(result.failed).toBe(true)
  }, 30_000)
})
