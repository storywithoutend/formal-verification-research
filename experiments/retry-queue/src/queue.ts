import { Clock, Duration, Effect, Ref, type Tracer } from "effect"
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
  readonly sequence: number
}

type TransitionResult =
  | { readonly ok: true; readonly state: AbstractState; readonly sequence: number }
  | { readonly ok: false; readonly error: InvalidTransition }

export type TraceEventPlacement = "commit" | "span-start" | "span-end"

export interface RenewalQueueOptions {
  readonly retryLimit?: number
  readonly traceEventPlacement?: TraceEventPlacement
  readonly beforeCommit?: (command: Command) => Effect.Effect<void>
  readonly afterCommit?: (command: Command, state: AbstractState) => Effect.Effect<void>
}

export interface RenewalQueue {
  readonly execute: (command: Command) => Effect.Effect<AbstractState, InvalidTransition>
  readonly snapshot: Effect.Effect<AbstractState>
  readonly trace: Effect.Effect<readonly AbstractState[]>
}

export const commandAttributes = (command: Command): Record<string, string> => ({
  "retry_queue.action": command.kind,
  "retry_queue.job": command.job,
  "retry_queue.worker": "worker" in command ? command.worker : "<none>"
})

export const recordTransitionEvent = (
  span: Tracer.Span,
  timestamp: bigint,
  sequence: number,
  command: Command,
  state: AbstractState,
  placement: TraceEventPlacement
): void => {
  const attributes = {
    ...commandAttributes(command),
    "retry_queue.sequence": sequence,
    "retry_queue.state_json": JSON.stringify(state),
    "retry_queue.placement": placement
  }
  span.attribute("retry_queue.sequence", sequence)
  span.attribute("retry_queue.state_json", attributes["retry_queue.state_json"])
  span.attribute("retry_queue.placement", placement)
  span.event("retry-queue.transition", timestamp, attributes)
}

const normalizeOptions = (input: number | RenewalQueueOptions): Required<Pick<RenewalQueueOptions, "retryLimit" | "traceEventPlacement">> & RenewalQueueOptions =>
  typeof input === "number"
    ? { retryLimit: input, traceEventPlacement: "commit" }
    : {
        ...input,
        retryLimit: input.retryLimit ?? maxAttempts,
        traceEventPlacement: input.traceEventPlacement ?? "commit"
      }

export const makeRenewalQueue = (
  input: number | RenewalQueueOptions = maxAttempts
): Effect.Effect<RenewalQueue> =>
  Effect.gen(function*() {
    const options = normalizeOptions(input)
    const first = initialState()
    const store = yield* Ref.make<Store>({ state: first, trace: [first], sequence: 0 })

    const execute = (command: Command): Effect.Effect<AbstractState, InvalidTransition> =>
      Effect.gen(function*() {
        const span = yield* Effect.currentSpan.pipe(Effect.orDie)
        const startTimestamp = yield* Clock.currentTimeNanos

        if (options.traceEventPlacement === "span-start") {
          const current = yield* Ref.get(store)
          try {
            const predicted = applyCommand(current.state, command, options.retryLimit)
            recordTransitionEvent(
              span,
              startTimestamp,
              current.sequence + 1,
              command,
              predicted,
              "span-start"
            )
          } catch {
            // Rejected transitions are represented by failed spans, not abstract events.
          }
        }

        if (options.beforeCommit !== undefined) yield* options.beforeCommit(command)

        const result = yield* Ref.modify(store, (current): readonly [TransitionResult, Store] => {
          try {
            const next = applyCommand(current.state, command, options.retryLimit)
            const sequence = current.sequence + 1
            if (options.traceEventPlacement === "commit") {
              recordTransitionEvent(span, startTimestamp, sequence, command, next, "commit")
            }
            return [
              { ok: true, state: cloneState(next), sequence },
              { state: next, trace: [...current.trace, next], sequence }
            ]
          } catch (error) {
            const transitionError = error instanceof InvalidTransition
              ? error
              : new InvalidTransition(command, error instanceof Error ? error.message : String(error))
            return [{ ok: false, error: transitionError }, current]
          }
        })

        if (!result.ok) return yield* Effect.fail(result.error)
        if (options.afterCommit !== undefined) yield* options.afterCommit(command, result.state)

        if (options.traceEventPlacement === "span-end") {
          const endTimestamp = yield* Clock.currentTimeNanos
          recordTransitionEvent(
            span,
            endTimestamp,
            result.sequence,
            command,
            result.state,
            "span-end"
          )
        }
        return result.state
      }).pipe(
        Effect.withSpan("retry-queue.step", { attributes: commandAttributes(command) })
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
