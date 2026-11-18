import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { type AbstractState, validateTracePure } from "./model.js"
import { summarizeTlcOutput, validateTraceWithTlc } from "./tlc-trace.js"

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const resultsDir = path.join(projectDir, "results")
const fixtures = [
  { file: "good-trace.json", expected: "accept" },
  { file: "fault-missing-atomicity.json", expected: "reject" },
  { file: "fault-duplicated-effect.json", expected: "reject" },
  { file: "fault-stale-worker-race.json", expected: "reject" },
  { file: "fault-bad-retry.json", expected: "reject" }
] as const

const rows: string[] = []
for (const fixture of fixtures) {
  const trace = JSON.parse(await readFile(path.join(resultsDir, fixture.file), "utf8")) as AbstractState[]
  const pure = validateTracePure(trace)
  const tlc = await validateTraceWithTlc(trace, fixture.file.replace(".json", ""))
  const accepted = pure.ok && tlc.ok
  if ((fixture.expected === "accept") !== accepted) {
    throw new Error(`${fixture.file}: expected ${fixture.expected}, pure=${JSON.stringify(pure)}, TLC=${tlc.exitCode}`)
  }
  const signal = summarizeTlcOutput(tlc.output).find((line) => line.startsWith("Error:")) ?? "No error"
  rows.push(`| \`${fixture.file}\` | ${trace.length} | ${pure.ok ? "accept" : "reject"} | ${tlc.ok ? "accept (0)" : `reject (${tlc.exitCode})`} | ${signal.replaceAll("|", "\\|")} |`)
}

const report = `# Trace validation summary

Generated and checked on 2026-11-19. The quick validator replays the event in
TypeScript; the independent path generates a TLA+ trace instance and asks TLC
whether every adjacent pair satisfies \`AllowedStep\` in \`RetryQueue.tla\`.

| Fixture | States | TypeScript replay | TLC | TLC signal |
|---|---:|---|---|---|
${rows.join("\n")}

A rejected trace demonstrates a discrepancy for that execution. Acceptance does
not prove all implementation executions conform; event completeness,
instrumentation, and unobserved schedules remain outside this check.
`

await writeFile(path.join(resultsDir, "trace-validation-summary.md"), report)
console.log(report)
