import { readFile } from "node:fs/promises"
import path from "node:path"
import { type AbstractState, validateTracePure } from "./model.js"
import { summarizeTlcOutput, validateTraceWithTlc } from "./tlc-trace.js"

const input = process.argv[2]
if (input === undefined) {
  console.error("usage: tsx src/validate-trace-cli.ts TRACE.json")
  process.exit(2)
}

const trace = JSON.parse(await readFile(input, "utf8")) as AbstractState[]
const pure = validateTracePure(trace)
const tlc = await validateTraceWithTlc(trace, path.basename(input, ".json"))

console.log(JSON.stringify({ pure, tlc: { ok: tlc.ok, exitCode: tlc.exitCode } }, null, 2))
for (const line of summarizeTlcOutput(tlc.output)) console.log(line)

if (!pure.ok || !tlc.ok) process.exit(1)
