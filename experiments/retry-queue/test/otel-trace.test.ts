import { Effect } from "effect"
import fc from "fast-check"
import { describe, expect, it } from "vitest"
import {
  type Command,
  type Job,
  type Worker,
  jobs,
  validateTracePure,
  workers
} from "../src/model.js"
import { captureSpans, spansToTrace, tracesMatch } from "../src/otel-trace.js"
import { makeRenewalQueue } from "../src/queue.js"
import { validateTraceWithTlc } from "../src/tlc-trace.js"

const jobArbitrary = fc.constantFrom<Job>(...jobs)
const workerArbitrary = fc.constantFrom<Worker>(...workers)
const jobWorker = fc.tuple(jobArbitrary, workerArbitrary)
const commandArbitrary: fc.Arbitrary<Command> = fc.oneof(
  jobWorker.map(([job, worker]) => ({ kind: "lease" as const, job, worker })),
  jobWorker.map(([job, worker]) => ({ kind: "retryable-failure" as const, job, worker })),
  jobArbitrary.map((job) => ({ kind: "wake-retry" as const, job })),
  jobWorker.map(([job, worker]) => ({ kind: "submit" as const, job, worker })),
  jobArbitrary.map((job) => ({ kind: "confirm" as const, job })),
  jobWorker.map(([job, worker]) => ({ kind: "permanent-failure" as const, job, worker }))
)

const runCommands = (commands: readonly Command[]) =>
  captureSpans(
    Effect.gen(function*() {
      const queue = yield* makeRenewalQueue()
      for (const command of commands) {
        yield* queue.execute(command).pipe(Effect.ignore)
      }
      return yield* queue.trace
    })
  )

describe("Effect OpenTelemetry transition events", () => {
  it.each([20_261_119, 20_261_120, 20_261_121])(
    "matches the custom transition log step for step for seed %i",
    async (seed) => {
      const commands = fc.sample(commandArbitrary, { seed, numRuns: 60 })
      const captured = await Effect.runPromise(runCommands(commands))
      const spanTrace = spansToTrace(captured.spans)
      expect(tracesMatch(spanTrace, captured.value)).toBe(true)
      expect(spanTrace).toEqual(captured.value)
      expect(validateTracePure(spanTrace)).toEqual({ ok: true })
    }
  )

  it("feeds the span-derived trace to the existing TLC replay", async () => {
    const commands: Command[] = [
      { kind: "lease", job: "alice.eth", worker: "worker-a" },
      { kind: "retryable-failure", job: "alice.eth", worker: "worker-a" },
      { kind: "wake-retry", job: "alice.eth" },
      { kind: "lease", job: "alice.eth", worker: "worker-b" },
      { kind: "submit", job: "alice.eth", worker: "worker-b" },
      { kind: "confirm", job: "alice.eth" }
    ]
    const captured = await Effect.runPromise(runCommands(commands))
    const spanTrace = spansToTrace(captured.spans)
    const tlc = await validateTraceWithTlc(spanTrace, "otel-good")
    expect(validateTracePure(spanTrace)).toEqual({ ok: true })
    expect(tlc.ok).toBe(true)
  }, 30_000)
})
