import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { plantedFaultTraces } from "../src/faults.js"
import { makeRenewalQueue } from "../src/queue.js"
import { summarizeTlcOutput, validateTraceWithTlc } from "../src/tlc-trace.js"

const goodTrace = async () => Effect.runPromise(
  Effect.gen(function*() {
    const queue = yield* makeRenewalQueue()
    yield* queue.execute({ kind: "lease", job: "alice.eth", worker: "worker-a" })
    yield* queue.execute({ kind: "submit", job: "alice.eth", worker: "worker-a" })
    yield* queue.execute({ kind: "confirm", job: "alice.eth" })
    return yield* queue.trace
  })
)

describe("TLC-backed trace validation", () => {
  it("accepts an implementation trace admitted by AllowedStep", async () => {
    const result = await validateTraceWithTlc(await goodTrace(), "vitest-good")
    expect(summarizeTlcOutput(result.output)).toContain("Model checking completed. No error has been found.")
    expect(result.ok).toBe(true)
  }, 30_000)

  for (const [name, makeTrace] of Object.entries(plantedFaultTraces)) {
    it(`rejects ${name}`, async () => {
      const result = await validateTraceWithTlc(makeTrace(), `vitest-${name}`)
      expect(result.ok).toBe(false)
      expect(result.output).toMatch(/Error: (Deadlock reached|Invariant .* is violated)/)
    }, 30_000)
  }
})
