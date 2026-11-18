import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { Effect } from "effect"
import { plantedFaultTraces } from "./faults.js"
import { makeRenewalQueue } from "./queue.js"

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const resultsDir = path.join(projectDir, "results")

const program = Effect.gen(function*() {
  const queue = yield* makeRenewalQueue()
  yield* queue.execute({ kind: "lease", job: "alice.eth", worker: "worker-a" })
  yield* queue.execute({ kind: "retryable-failure", job: "alice.eth", worker: "worker-a" })
  yield* queue.execute({ kind: "lease", job: "bob.eth", worker: "worker-b" })
  yield* queue.execute({ kind: "submit", job: "bob.eth", worker: "worker-b" })
  yield* queue.execute({ kind: "confirm", job: "bob.eth" })
  yield* queue.execute({ kind: "wake-retry", job: "alice.eth" })
  yield* queue.execute({ kind: "lease", job: "alice.eth", worker: "worker-b" })
  yield* queue.execute({ kind: "submit", job: "alice.eth", worker: "worker-b" })
  yield* queue.execute({ kind: "confirm", job: "alice.eth" })
  return yield* queue.trace
})

await mkdir(resultsDir, { recursive: true })
const goodTrace = await Effect.runPromise(program)
await writeFile(path.join(resultsDir, "good-trace.json"), `${JSON.stringify(goodTrace, null, 2)}\n`)

for (const [name, makeTrace] of Object.entries(plantedFaultTraces)) {
  await writeFile(
    path.join(resultsDir, `fault-${name}.json`),
    `${JSON.stringify(makeTrace(), null, 2)}\n`
  )
}

console.log(`wrote ${goodTrace.length} good states and ${Object.keys(plantedFaultTraces).length} fault traces`)
