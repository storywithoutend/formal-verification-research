import { spawnSync } from "node:child_process"
import { cp, mkdir, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  type AbstractState,
  type Job,
  type Worker,
  jobs,
  maxAttempts,
  workers
} from "./model.js"

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const repoDir = path.resolve(projectDir, "../..")
const modelDir = path.join(projectDir, "model")
const toolsDir = path.join(repoDir, "experiments", ".tools")

const tlaString = (value: string): string => `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`
const tlaSet = (values: readonly string[]): string => `{${values.map(tlaString).join(", ")}}`

const tlaFunction = <T>(values: Record<Job, T>, render: (value: T) => string): string =>
  `(${tlaString(jobs[0])} :> ${render(values[jobs[0]])}) @@ ` +
  `(${tlaString(jobs[1])} :> ${render(values[jobs[1]])})`

const renderState = (state: AbstractState): string => `[
  phase |-> ${tlaFunction(state.phase, tlaString)},
  owners |-> ${tlaFunction(state.owners, tlaSet)},
  attempts |-> ${tlaFunction(state.attempts, String)},
  submissions |-> ${tlaFunction(state.submissions, String)},
  event |-> [kind |-> ${tlaString(state.event.kind)}, job |-> ${tlaString(state.event.job ?? "<none>")}, worker |-> ${tlaString(state.event.worker ?? "<none>")}]
]`

const renderModule = (moduleName: string, trace: readonly AbstractState[]): string => `-------------------------- MODULE ${moduleName} --------------------------
EXTENDS TLC

JobsValue == ${tlaSet(jobs)}
WorkersValue == ${tlaSet(workers)}
TraceValue == <<
${trace.map((state) => renderState(state).split("\n").map((line) => `  ${line}`).join("\n")).join(",\n")}
>>

VARIABLES state, index

INSTANCE TraceReplay WITH
  Jobs <- JobsValue,
  Workers <- WorkersValue,
  MaxAttempts <- ${maxAttempts},
  NoJob <- "<none>",
  NoWorker <- "<none>",
  Trace <- TraceValue,
  state <- state,
  index <- index

=============================================================================
`

const renderConfig = (): string => `SPECIFICATION TraceSpec

INVARIANT TypeOK
INVARIANT TraceIndexOK

CHECK_DEADLOCK TRUE
`

export interface TlcTraceResult {
  readonly ok: boolean
  readonly exitCode: number | null
  readonly output: string
  readonly workDir: string
}

export const validateTraceWithTlc = async (
  trace: readonly AbstractState[],
  label: string
): Promise<TlcTraceResult> => {
  const safeLabel = label.replaceAll(/[^A-Za-z0-9_-]/g, "-")
  const moduleName = `Trace${safeLabel.replaceAll("-", "") || "Run"}`
  const workDir = path.join(projectDir, ".tmp", "trace-validation", safeLabel)
  await rm(workDir, { recursive: true, force: true })
  await mkdir(workDir, { recursive: true })
  await Promise.all([
    cp(path.join(modelDir, "RetryQueue.tla"), path.join(workDir, "RetryQueue.tla")),
    cp(path.join(modelDir, "TraceReplay.tla"), path.join(workDir, "TraceReplay.tla")),
    writeFile(path.join(workDir, `${moduleName}.tla`), renderModule(moduleName, trace)),
    writeFile(path.join(workDir, `${moduleName}.cfg`), renderConfig())
  ])

  const result = spawnSync(
    path.join(toolsDir, "jdk", "bin", "java"),
    [
      "-XX:+UseParallelGC",
      "-cp",
      path.join(toolsDir, "tla2tools.jar"),
      "tlc2.TLC",
      "-workers",
      "1",
      "-fp",
      "0",
      "-config",
      `${moduleName}.cfg`,
      moduleName
    ],
    { cwd: workDir, encoding: "utf8" }
  )
  const output = `${result.stdout}${result.stderr}`
  return { ok: result.status === 0, exitCode: result.status, output, workDir }
}

export const summarizeTlcOutput = (output: string): string[] =>
  output.split("\n").filter((line) =>
    /Model checking completed|Error: Invariant|Error: Deadlock|states generated|depth of the complete/.test(line)
  )
