import assert from "node:assert/strict"
import { Effect } from "effect"
import fc, { type AsyncCommand } from "fast-check"
import { describe, it } from "vitest"
import {
  type AbstractState,
  type Command,
  type Job,
  type Worker,
  applyCommand,
  assertInvariants,
  formatCommand,
  initialState,
  jobs,
  workers
} from "../src/model.js"
import { type RenewalQueue, makeRenewalQueue } from "../src/queue.js"

interface ModelState {
  state: AbstractState
}

class QueueCommand implements AsyncCommand<ModelState, RenewalQueue> {
  constructor(readonly command: Command) {}

  check(model: Readonly<ModelState>): boolean {
    try {
      applyCommand(model.state, this.command)
      return true
    } catch {
      return false
    }
  }

  async run(model: ModelState, queue: RenewalQueue): Promise<void> {
    const expected = applyCommand(model.state, this.command)
    await Effect.runPromise(queue.execute(this.command))
    const actual = await Effect.runPromise(queue.snapshot)
    assert.deepEqual(actual, expected)
    assertInvariants(actual)
    model.state = expected
  }

  toString(): string {
    return formatCommand(this.command)
  }
}

const jobArbitrary = fc.constantFrom<Job>(...jobs)
const workerArbitrary = fc.constantFrom<Worker>(...workers)
const jobWorker = fc.tuple(jobArbitrary, workerArbitrary)

const commandArbitrary: fc.Arbitrary<QueueCommand> = fc.oneof(
  jobWorker.map(([job, worker]) => new QueueCommand({ kind: "lease", job, worker })),
  jobWorker.map(([job, worker]) => new QueueCommand({ kind: "retryable-failure", job, worker })),
  jobArbitrary.map((job) => new QueueCommand({ kind: "wake-retry", job })),
  jobWorker.map(([job, worker]) => new QueueCommand({ kind: "submit", job, worker })),
  jobArbitrary.map((job) => new QueueCommand({ kind: "confirm", job })),
  jobWorker.map(([job, worker]) => new QueueCommand({ kind: "permanent-failure", job, worker }))
)

describe("fast-check model-based queue", () => {
  it("keeps the Effect implementation equal to the executable abstract model", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.commands([commandArbitrary], { maxCommands: 40 }),
        async (commands) => {
          await fc.asyncModelRun(
            async () => ({
              model: { state: initialState() },
              real: await Effect.runPromise(makeRenewalQueue())
            }),
            commands
          )
        }
      ),
      { numRuns: 200, seed: 20_261_119 }
    )
  })
})
