import {
  type AbstractState,
  type Job,
  type Worker,
  applyCommand,
  cloneState,
  initialState
} from "./model.js"

const append = (trace: AbstractState[], state: AbstractState): AbstractState[] => [...trace, cloneState(state)]

export const missingAtomicityTrace = (): readonly AbstractState[] => {
  const first = initialState()
  const leased = applyCommand(first, { kind: "lease", job: "alice.eth", worker: "worker-a" })
  const broken: AbstractState = {
    ...cloneState(leased),
    owners: { ...leased.owners, "alice.eth": ["worker-a", "worker-b"] },
    event: { kind: "lease", job: "alice.eth", worker: "worker-b" }
  }
  return [first, leased, broken]
}

export const duplicatedEffectTrace = (): readonly AbstractState[] => {
  const first = initialState()
  const leased = applyCommand(first, { kind: "lease", job: "alice.eth", worker: "worker-a" })
  const submitted = applyCommand(leased, { kind: "submit", job: "alice.eth", worker: "worker-a" })
  const broken: AbstractState = {
    ...cloneState(submitted),
    submissions: { ...submitted.submissions, "alice.eth": 2 },
    event: { kind: "submit", job: "alice.eth", worker: "worker-a" }
  }
  return [first, leased, submitted, broken]
}

export const staleWorkerRaceTrace = (): readonly AbstractState[] => {
  const first = initialState()
  const leased = applyCommand(first, { kind: "lease", job: "alice.eth", worker: "worker-b" })
  const broken: AbstractState = {
    ...cloneState(leased),
    phase: { ...leased.phase, "alice.eth": "queued" },
    event: { kind: "retryable-failure", job: "alice.eth", worker: "worker-a" }
  }
  return [first, leased, broken]
}

export const badRetryTrace = (): readonly AbstractState[] => {
  const job: Job = "alice.eth"
  const firstWorker: Worker = "worker-a"
  const secondWorker: Worker = "worker-b"
  let state = initialState()
  let trace: AbstractState[] = [state]

  const step = (command: Parameters<typeof applyCommand>[1]): void => {
    state = applyCommand(state, command)
    trace = append(trace, state)
  }

  step({ kind: "lease", job, worker: firstWorker })
  step({ kind: "retryable-failure", job, worker: firstWorker })
  step({ kind: "wake-retry", job })
  step({ kind: "lease", job, worker: secondWorker })
  step({ kind: "retryable-failure", job, worker: secondWorker })

  const broken: AbstractState = {
    ...cloneState(state),
    phase: { ...state.phase, [job]: "leased" },
    owners: { ...state.owners, [job]: [firstWorker] },
    attempts: { ...state.attempts, [job]: 3 },
    event: { kind: "lease", job, worker: firstWorker }
  }
  return append(trace, broken)
}

export const plantedFaultTraces = {
  "missing-atomicity": missingAtomicityTrace,
  "duplicated-effect": duplicatedEffectTrace,
  "stale-worker-race": staleWorkerRaceTrace,
  "bad-retry": badRetryTrace
} as const
