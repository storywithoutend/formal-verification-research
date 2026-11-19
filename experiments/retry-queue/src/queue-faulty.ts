import { Clock, Effect, Ref } from "effect"
import {
  type AbstractState,
  type Command,
  InvalidTransition,
  applyCommand,
  cloneState,
  initialState,
  maxAttempts
} from "./model.js"
import {
  commandAttributes,
  recordTransitionEvent,
  type RenewalQueue
} from "./queue.js"

export type QueueFault =
  | "non-atomic-lease"
  | "duplicated-submission-on-retry"
  | "stale-worker-failure-requeue"
  | "off-by-one-retry-limit"

export interface FaultyRenewalQueueOptions {
  readonly retryLimit?: number
  readonly beforeStaleLeaseWrite?: (command: Command) => Effect.Effect<void>
}

interface Store {
  readonly state: AbstractState
  readonly trace: readonly AbstractState[]
  readonly sequence: number
}

type TransitionResult =
  | { readonly ok: true; readonly state: AbstractState }
  | { readonly ok: false; readonly error: InvalidTransition }

const duplicatedSubmission = (
  state: AbstractState,
  command: Command,
  retryLimit: number
): AbstractState | undefined => {
  if (
    command.kind !== "submit" ||
    state.phase[command.job] !== "leased" ||
    state.attempts[command.job] <= 1 ||
    state.owners[command.job][0] !== command.worker
  ) return undefined
  const submitted = applyCommand(state, command, retryLimit)
  return {
    ...cloneState(submitted),
    submissions: { ...submitted.submissions, [command.job]: 2 }
  }
}

const staleFailureRequeue = (
  state: AbstractState,
  command: Command
): AbstractState | undefined => {
  if (
    command.kind !== "retryable-failure" ||
    state.phase[command.job] !== "leased" ||
    state.owners[command.job].length !== 1 ||
    state.owners[command.job][0] === command.worker
  ) return undefined
  return {
    ...cloneState(state),
    phase: { ...state.phase, [command.job]: "queued" },
    event: { ...command }
  }
}

const offByOneLease = (
  state: AbstractState,
  command: Command,
  retryLimit: number
): AbstractState | undefined => {
  if (
    command.kind !== "lease" ||
    state.phase[command.job] !== "failed" ||
    state.attempts[command.job] !== retryLimit
  ) return undefined
  return {
    ...cloneState(state),
    phase: { ...state.phase, [command.job]: "leased" },
    owners: { ...state.owners, [command.job]: [command.worker] },
    attempts: { ...state.attempts, [command.job]: state.attempts[command.job] + 1 },
    event: { ...command }
  }
}

const applyFault = (
  fault: Exclude<QueueFault, "non-atomic-lease">,
  state: AbstractState,
  command: Command,
  retryLimit: number
): AbstractState => {
  if (fault === "duplicated-submission-on-retry") {
    return duplicatedSubmission(state, command, retryLimit) ?? applyCommand(state, command, retryLimit)
  }
  if (fault === "stale-worker-failure-requeue") {
    return staleFailureRequeue(state, command) ?? applyCommand(state, command, retryLimit)
  }
  return offByOneLease(state, command, retryLimit) ?? applyCommand(state, command, retryLimit)
}

export const makeFaultyRenewalQueue = (
  fault: QueueFault,
  options: FaultyRenewalQueueOptions = {}
): Effect.Effect<RenewalQueue> =>
  Effect.gen(function*() {
    const retryLimit = options.retryLimit ?? maxAttempts
    const first = initialState()
    const store = yield* Ref.make<Store>({ state: first, trace: [first], sequence: 0 })

    const execute = (command: Command): Effect.Effect<AbstractState, InvalidTransition> =>
      Effect.gen(function*() {
        const span = yield* Effect.currentSpan.pipe(Effect.orDie)
        const timestamp = yield* Clock.currentTimeNanos

        if (fault === "non-atomic-lease" && command.kind === "lease") {
          const stale = yield* Ref.get(store)
          let staleNext: AbstractState
          try {
            staleNext = applyCommand(stale.state, command, retryLimit)
          } catch (error) {
            return yield* Effect.fail(
              error instanceof InvalidTransition
                ? error
                : new InvalidTransition(command, error instanceof Error ? error.message : String(error))
            )
          }
          if (options.beforeStaleLeaseWrite !== undefined) {
            yield* options.beforeStaleLeaseWrite(command)
          }
          const result = yield* Ref.modify(store, (current): readonly [TransitionResult, Store] => {
            const sequence = current.sequence + 1
            recordTransitionEvent(span, timestamp, sequence, command, staleNext, "commit")
            return [
              { ok: true, state: cloneState(staleNext) },
              { state: staleNext, trace: [...current.trace, staleNext], sequence }
            ]
          })
          return result.ok ? result.state : yield* Effect.fail(result.error)
        }

        const result = yield* Ref.modify(store, (current): readonly [TransitionResult, Store] => {
          try {
            const next = fault === "non-atomic-lease"
              ? applyCommand(current.state, command, retryLimit)
              : applyFault(fault, current.state, command, retryLimit)
            const sequence = current.sequence + 1
            recordTransitionEvent(span, timestamp, sequence, command, next, "commit")
            return [
              { ok: true, state: cloneState(next) },
              { state: next, trace: [...current.trace, next], sequence }
            ]
          } catch (error) {
            const transitionError = error instanceof InvalidTransition
              ? error
              : new InvalidTransition(command, error instanceof Error ? error.message : String(error))
            return [{ ok: false, error: transitionError }, current]
          }
        })
        return result.ok ? result.state : yield* Effect.fail(result.error)
      }).pipe(
        Effect.withSpan("retry-queue.step", { attributes: commandAttributes(command) })
      )

    return {
      execute,
      snapshot: Ref.get(store).pipe(Effect.map(({ state }) => cloneState(state))),
      trace: Ref.get(store).pipe(Effect.map(({ trace }) => trace.map(cloneState)))
    }
  })
