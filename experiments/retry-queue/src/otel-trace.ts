import { isDeepStrictEqual } from "node:util"
import { NodeSdk } from "@effect/opentelemetry"
import type { Sampler } from "@opentelemetry/sdk-trace-base"
import {
  AlwaysOnSampler,
  InMemorySpanExporter,
  SimpleSpanProcessor,
  type ReadableSpan
} from "@opentelemetry/sdk-trace-base"
import { Effect } from "effect"
import { type AbstractState, initialState } from "./model.js"

export interface CapturedTracing<A> {
  readonly value: A
  readonly spans: readonly ReadableSpan[]
}

export interface InMemoryTracingOptions {
  readonly sampler?: Sampler
  readonly serviceName?: string
}

export const captureSpans = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  options: InMemoryTracingOptions = {}
): Effect.Effect<CapturedTracing<A>, E, R> => {
  const exporter = new InMemorySpanExporter()
  const processor = new SimpleSpanProcessor(exporter)
  const layer = NodeSdk.layer(() => ({
    resource: { serviceName: options.serviceName ?? "retry-queue-model-first" },
    spanProcessor: processor,
    tracerConfig: { sampler: options.sampler ?? new AlwaysOnSampler() }
  }))

  return Effect.gen(function*() {
    const value = yield* effect
    yield* Effect.promise(() => processor.forceFlush())
    return { value, spans: [...exporter.getFinishedSpans()] }
  }).pipe(Effect.provide(layer))
}

export type SpanOrder = "sequence" | "timestamp"

export interface SpanTransition {
  readonly sequence: number
  readonly state: AbstractState
  readonly timestamp: readonly [number, number]
  readonly placement: string
  readonly spanName: string
}

export interface SpanConversionOptions {
  readonly order?: SpanOrder
  readonly requireContiguousSequence?: boolean
}

const attribute = (attributes: Readonly<Record<string, unknown>>, name: string): unknown =>
  attributes[name]

const parseTransition = (
  span: ReadableSpan,
  event: ReadableSpan["events"][number]
): SpanTransition => {
  const attributes = event.attributes ?? {}
  const sequence = attribute(attributes, "retry_queue.sequence")
  const stateJson = attribute(attributes, "retry_queue.state_json")
  const placement = attribute(attributes, "retry_queue.placement")
  if (typeof sequence !== "number" || !Number.isSafeInteger(sequence)) {
    throw new Error(`span ${span.name} has no integer retry_queue.sequence`)
  }
  if (typeof stateJson !== "string") {
    throw new Error(`span ${span.name} sequence ${sequence} has no retry_queue.state_json`)
  }
  if (typeof placement !== "string") {
    throw new Error(`span ${span.name} sequence ${sequence} has no retry_queue.placement`)
  }
  return {
    sequence,
    state: JSON.parse(stateJson) as AbstractState,
    timestamp: event.time,
    placement,
    spanName: span.name
  }
}

const timestampCompare = (left: readonly [number, number], right: readonly [number, number]): number =>
  left[0] === right[0] ? left[1] - right[1] : left[0] - right[0]

export const extractSpanTransitions = (
  spans: readonly ReadableSpan[],
  order: SpanOrder = "sequence"
): readonly SpanTransition[] => {
  const transitions = spans.flatMap((span) =>
    span.events
      .filter((event) => event.name === "retry-queue.transition")
      .map((event) => parseTransition(span, event))
  )
  return [...transitions].sort((left, right) =>
    order === "sequence"
      ? left.sequence - right.sequence
      : timestampCompare(left.timestamp, right.timestamp)
  )
}

export const spansToTrace = (
  spans: readonly ReadableSpan[],
  options: SpanConversionOptions = {}
): readonly AbstractState[] => {
  const transitions = extractSpanTransitions(spans, options.order ?? "sequence")
  if (options.requireContiguousSequence ?? true) {
    transitions.forEach((transition, index) => {
      const expected = index + 1
      if (transition.sequence !== expected) {
        throw new Error(`expected transition sequence ${expected}, got ${transition.sequence}`)
      }
    })
  }
  return [initialState(), ...transitions.map(({ state }) => state)]
}

export const tracesMatch = (
  left: readonly AbstractState[],
  right: readonly AbstractState[]
): boolean => isDeepStrictEqual(left, right)
