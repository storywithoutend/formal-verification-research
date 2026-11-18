import { Duration, Effect, Ref } from "effect"
import {
  type AbstractState,
  type Command,
  type Job,
  type Worker,
  InvalidTransition,
  applyCommand,
  cloneState,
  initialState,
  maxAttempts
} from "./model.js"

interface Store {
  readonly state: AbstractState
  readonly trace: readonly AbstractState[]
}

type TransitionResult =
  | { readonly ok: true; readonly state: AbstractState }
  | { readonly ok: false; readonly error: InvalidTransition }

export interface RenewalQueue {
  readonly execute: (command: Command) => Effect.Effect<AbstractState, InvalidTransition>
  readonly snapshot: Effect.Effect<AbstractState>
  readonly trace: Effect.Effect<readonly AbstractState[]>
}

export const makeRenewalQueue = (
  retryLimit = maxAttempts
): Effect.Effect<RenewalQueue> =>
  Effect.gen(function*() {
    const first = initialState()
    const store = yield* Ref.make<Store>({ state: first, trace: [first] })

    const execute = (command: Command): Effect.Effect<AbstractState, InvalidTransition> =>
      Ref.modify(store, (current): readonly [TransitionResult, Store] => {
        try {
          const next = applyCommand(current.state, command, retryLimit)
          return [{ ok: true, state: cloneState(next) }, { state: next, trace: [...current.trace, next] }]
        } catch (error) {
          const transitionError = error instanceof InvalidTransition
            ? error
            : new InvalidTransition(command, error instanceof Error ? error.message : String(error))
          return [{ ok: false, error: transitionError }, current]
        }
      }).pipe(
        Effect.flatMap((result) => result.ok ? Effect.succeed(result.state) : Effect.fail(result.error))
      )

    return {
      execute,
      snapshot: Ref.get(store).pipe(Effect.map(({ state }) => cloneState(state))),
      trace: Ref.get(store).pipe(Effect.map(({ trace }) => trace.map(cloneState)))
    }
  })

export type AttemptOutcome = "success" | "retryable-failure" | "permanent-failure"

export const runAttempt = (
  queue: RenewalQueue,
  job: Job,
  worker: Worker,
  outcome: AttemptOutcome,
  backoff: Duration.DurationInput = "1 second"
): Effect.Effect<void, InvalidTransition> =>
  Effect.gen(function*() {
    yield* queue.execute({ kind: "lease", job, worker })
    switch (outcome) {
      case "success":
        yield* queue.execute({ kind: "submit", job, worker })
        yield* queue.execute({ kind: "confirm", job })
        return
      case "permanent-failure":
        yield* queue.execute({ kind: "permanent-failure", job, worker })
        return
      case "retryable-failure":
        yield* queue.execute({ kind: "retryable-failure", job, worker })
        yield* Effect.sleep(backoff)
        yield* queue.execute({ kind: "wake-retry", job })
    }
  })
