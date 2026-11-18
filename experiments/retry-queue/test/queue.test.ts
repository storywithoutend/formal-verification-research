import { Effect, Either, Fiber, TestClock, TestContext } from "effect"
import { describe, expect, it } from "vitest"
import { assertInvariants, initialState, validateTracePure } from "../src/model.js"
import { makeRenewalQueue, runAttempt } from "../src/queue.js"

describe("Effect renewal queue", () => {
  it("serializes concurrent leases so only one worker owns a job", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function*() {
        const queue = yield* makeRenewalQueue()
        const left = yield* queue.execute({
          kind: "lease",
          job: "alice.eth",
          worker: "worker-a"
        }).pipe(Effect.either, Effect.fork)
        const right = yield* queue.execute({
          kind: "lease",
          job: "alice.eth",
          worker: "worker-b"
        }).pipe(Effect.either, Effect.fork)
        const outcomes = [yield* Fiber.join(left), yield* Fiber.join(right)]
        return { outcomes, state: yield* queue.snapshot, trace: yield* queue.trace }
      })
    )

    expect(result.outcomes.filter(Either.isRight)).toHaveLength(1)
    expect(result.outcomes.filter(Either.isLeft)).toHaveLength(1)
    expect(result.state.owners["alice.eth"]).toHaveLength(1)
    expect(validateTracePure(result.trace)).toEqual({ ok: true })
  })

  it("uses TestClock for deterministic retry backoff while another job completes", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function*() {
        const queue = yield* makeRenewalQueue()
        const retry = yield* runAttempt(
          queue,
          "alice.eth",
          "worker-a",
          "retryable-failure",
          "5 seconds"
        ).pipe(Effect.fork)
        const success = yield* runAttempt(
          queue,
          "bob.eth",
          "worker-b",
          "success"
        ).pipe(Effect.fork)

        yield* Fiber.join(success)
        const beforeWake = yield* queue.snapshot
        yield* TestClock.adjust("5 seconds")
        yield* Fiber.join(retry)
        return { beforeWake, afterWake: yield* queue.snapshot, trace: yield* queue.trace }
      }).pipe(Effect.provide(TestContext.TestContext))
    )

    expect(result.beforeWake.phase["alice.eth"]).toBe("backoff")
    expect(result.beforeWake.phase["bob.eth"]).toBe("done")
    expect(result.afterWake.phase["alice.eth"]).toBe("queued")
    expect(validateTracePure(result.trace)).toEqual({ ok: true })
    assertInvariants(result.afterWake)
  })

  it("records a permanent failure without retrying", async () => {
    const state = await Effect.runPromise(
      Effect.gen(function*() {
        const queue = yield* makeRenewalQueue()
        yield* runAttempt(queue, "alice.eth", "worker-a", "permanent-failure")
        return yield* queue.snapshot
      })
    )
    expect(state.phase["alice.eth"]).toBe("failed")
    expect(state.attempts["alice.eth"]).toBe(1)
    expect(state.owners["alice.eth"]).toEqual([])
  })

  it("starts from the same abstract initial state as the TLA+ model", async () => {
    const state = await Effect.runPromise(
      Effect.gen(function*() {
        const queue = yield* makeRenewalQueue()
        return yield* queue.snapshot
      })
    )
    expect(state).toEqual(initialState())
  })
})
