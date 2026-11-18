import { isDeepStrictEqual } from "node:util"

export const jobs = ["alice.eth", "bob.eth"] as const
export const workers = ["worker-a", "worker-b"] as const
export const maxAttempts = 2

export type Job = (typeof jobs)[number]
export type Worker = (typeof workers)[number]
export type Phase = "queued" | "leased" | "backoff" | "submitted" | "done" | "failed"
export type EventKind =
  | "init"
  | "lease"
  | "retryable-failure"
  | "wake-retry"
  | "submit"
  | "confirm"
  | "permanent-failure"

export interface TraceEvent {
  readonly kind: EventKind
  readonly job: Job | null
  readonly worker: Worker | null
}

export interface AbstractState {
  readonly phase: Record<Job, Phase>
  readonly owners: Record<Job, readonly Worker[]>
  readonly attempts: Record<Job, number>
  readonly submissions: Record<Job, number>
  readonly event: TraceEvent
}

export type Command =
  | { readonly kind: "lease"; readonly job: Job; readonly worker: Worker }
  | { readonly kind: "retryable-failure"; readonly job: Job; readonly worker: Worker }
  | { readonly kind: "wake-retry"; readonly job: Job }
  | { readonly kind: "submit"; readonly job: Job; readonly worker: Worker }
  | { readonly kind: "confirm"; readonly job: Job }
  | { readonly kind: "permanent-failure"; readonly job: Job; readonly worker: Worker }

export class InvalidTransition extends Error {
  readonly command: Command

  constructor(command: Command, reason: string) {
    super(`${formatCommand(command)}: ${reason}`)
    this.name = "InvalidTransition"
    this.command = command
  }
}

const record = <T>(alice: T, bob: T): Record<Job, T> => ({
  "alice.eth": alice,
  "bob.eth": bob
})

export const initialState = (): AbstractState => ({
  phase: record("queued", "queued"),
  owners: record([], []),
  attempts: record(0, 0),
  submissions: record(0, 0),
  event: { kind: "init", job: null, worker: null }
})

export const cloneState = (state: AbstractState): AbstractState => ({
  phase: { ...state.phase },
  owners: {
    "alice.eth": [...state.owners["alice.eth"]],
    "bob.eth": [...state.owners["bob.eth"]]
  },
  attempts: { ...state.attempts },
  submissions: { ...state.submissions },
  event: { ...state.event }
})

const withJob = (
  state: AbstractState,
  job: Job,
  patch: {
    readonly phase?: Phase
    readonly owners?: readonly Worker[]
    readonly attempts?: number
    readonly submissions?: number
    readonly event: TraceEvent
  }
): AbstractState => ({
  phase: patch.phase === undefined ? { ...state.phase } : { ...state.phase, [job]: patch.phase },
  owners: patch.owners === undefined
    ? { "alice.eth": [...state.owners["alice.eth"]], "bob.eth": [...state.owners["bob.eth"]] }
    : { "alice.eth": [...state.owners["alice.eth"]], "bob.eth": [...state.owners["bob.eth"]], [job]: [...patch.owners] },
  attempts: patch.attempts === undefined ? { ...state.attempts } : { ...state.attempts, [job]: patch.attempts },
  submissions: patch.submissions === undefined ? { ...state.submissions } : { ...state.submissions, [job]: patch.submissions },
  event: patch.event
})

const requireTransition = (condition: boolean, command: Command, reason: string): void => {
  if (!condition) throw new InvalidTransition(command, reason)
}

export const applyCommand = (
  state: AbstractState,
  command: Command,
  retryLimit = maxAttempts
): AbstractState => {
  const { job } = command
  switch (command.kind) {
    case "lease": {
      requireTransition(state.phase[job] === "queued", command, "job is not queued")
      requireTransition(state.owners[job].length === 0, command, "job already has an owner")
      requireTransition(state.attempts[job] < retryLimit, command, "retry budget exhausted")
      return withJob(state, job, {
        phase: "leased",
        owners: [command.worker],
        attempts: state.attempts[job] + 1,
        event: { ...command }
      })
    }
    case "retryable-failure": {
      requireTransition(state.phase[job] === "leased", command, "job is not leased")
      requireTransition(
        state.owners[job].length === 1 && state.owners[job][0] === command.worker,
        command,
        "worker does not own the lease"
      )
      return withJob(state, job, {
        phase: state.attempts[job] < retryLimit ? "backoff" : "failed",
        owners: [],
        event: { ...command }
      })
    }
    case "wake-retry": {
      requireTransition(state.phase[job] === "backoff", command, "job is not waiting in backoff")
      requireTransition(state.owners[job].length === 0, command, "backoff job is still owned")
      return withJob(state, job, {
        phase: "queued",
        event: { ...command, worker: null }
      })
    }
    case "submit": {
      requireTransition(state.phase[job] === "leased", command, "job is not leased")
      requireTransition(
        state.owners[job].length === 1 && state.owners[job][0] === command.worker,
        command,
        "worker does not own the lease"
      )
      requireTransition(state.submissions[job] === 0, command, "renewal was already submitted")
      return withJob(state, job, {
        phase: "submitted",
        owners: [],
        submissions: state.submissions[job] + 1,
        event: { ...command }
      })
    }
    case "confirm": {
      requireTransition(state.phase[job] === "submitted", command, "job has not been submitted")
      requireTransition(state.submissions[job] === 1, command, "submission count is not exactly one")
      return withJob(state, job, {
        phase: "done",
        event: { ...command, worker: null }
      })
    }
    case "permanent-failure": {
      requireTransition(state.phase[job] === "leased", command, "job is not leased")
      requireTransition(
        state.owners[job].length === 1 && state.owners[job][0] === command.worker,
        command,
        "worker does not own the lease"
      )
      return withJob(state, job, {
        phase: "failed",
        owners: [],
        event: { ...command }
      })
    }
  }
}

export const assertInvariants = (state: AbstractState, retryLimit = maxAttempts): void => {
  for (const job of jobs) {
    if (state.owners[job].length > 1) throw new Error(`ExclusiveLease failed for ${job}`)
    if ((state.phase[job] === "leased") !== (state.owners[job].length === 1)) {
      throw new Error(`LeasePhaseConsistent failed for ${job}`)
    }
    if (state.submissions[job] > 1) throw new Error(`SubmitAtMostOnce failed for ${job}`)
    if (state.phase[job] === "done" && state.submissions[job] !== 1) {
      throw new Error(`CompletionAfterSubmission failed for ${job}`)
    }
    if (state.attempts[job] > retryLimit) throw new Error(`RetryBound failed for ${job}`)
    if (["submitted", "done", "failed"].includes(state.phase[job]) && state.owners[job].length !== 0) {
      throw new Error(`TerminalUnowned failed for ${job}`)
    }
  }
}

export const commandFromEvent = (event: TraceEvent): Command | null => {
  if (event.kind === "init") return null
  if (event.job === null) throw new Error(`${event.kind} is missing a job`)
  if (event.kind === "wake-retry" || event.kind === "confirm") {
    return { kind: event.kind, job: event.job }
  }
  if (event.worker === null) throw new Error(`${event.kind} is missing a worker`)
  return { kind: event.kind, job: event.job, worker: event.worker }
}

export const validateTracePure = (
  trace: readonly AbstractState[],
  retryLimit = maxAttempts
): { readonly ok: true } | { readonly ok: false; readonly index: number; readonly reason: string } => {
  if (trace.length === 0) return { ok: false, index: 0, reason: "trace is empty" }
  if (!isDeepStrictEqual(trace[0], initialState())) {
    return { ok: false, index: 0, reason: "first state is not InitialState" }
  }
  for (let index = 0; index < trace.length; index += 1) {
    const current = trace[index]
    if (current === undefined) return { ok: false, index, reason: "missing state" }
    try {
      assertInvariants(current, retryLimit)
      if (index === 0) continue
      const previous = trace[index - 1]
      if (previous === undefined) return { ok: false, index, reason: "missing previous state" }
      const command = commandFromEvent(current.event)
      if (command === null) return { ok: false, index, reason: "init event appears after the initial state" }
      const expected = applyCommand(previous, command, retryLimit)
      if (!isDeepStrictEqual(current, expected)) {
        return { ok: false, index, reason: `state does not match ${formatCommand(command)}` }
      }
    } catch (error) {
      return { ok: false, index, reason: error instanceof Error ? error.message : String(error) }
    }
  }
  return { ok: true }
}

export const formatCommand = (command: Command): string => {
  const worker = "worker" in command ? `/${command.worker}` : ""
  return `${command.kind}/${command.job}${worker}`
}
