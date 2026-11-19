import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { captureSpans, extractSpanTransitions, spansToTrace } from "../src/otel-trace.js"
import { makeRenewalQueue } from "../src/queue.js"

describe("OpenTelemetry mutation gate", () => {
  it("exports one complete commit event per accepted transition", async () => {
    const captured = await Effect.runPromise(
      captureSpans(
        Effect.gen(function*() {
          const queue = yield* makeRenewalQueue()
          yield* queue.execute({ kind: "lease", job: "alice.eth", worker: "worker-a" })
          yield* queue.execute({ kind: "submit", job: "alice.eth", worker: "worker-a" })
          yield* queue.execute({ kind: "confirm", job: "alice.eth" })
          return yield* queue.trace
        })
      )
    )

    const transitions = extractSpanTransitions(captured.spans)
    expect(transitions.map(({ sequence }) => sequence)).toEqual([1, 2, 3])
    expect(transitions.map(({ placement }) => placement)).toEqual(["commit", "commit", "commit"])
    expect(spansToTrace(captured.spans)).toEqual(captured.value)

    const spans = [...captured.spans].sort((left, right) =>
      Number(left.attributes["retry_queue.sequence"]) - Number(right.attributes["retry_queue.sequence"])
    )
    expect(spans).toHaveLength(3)
    expect(spans.map(({ name }) => name)).toEqual([
      "retry-queue.step",
      "retry-queue.step",
      "retry-queue.step"
    ])
    expect(spans.map(({ attributes }) => attributes["retry_queue.action"])).toEqual([
      "lease",
      "submit",
      "confirm"
    ])
    expect(spans.map(({ attributes }) => attributes["retry_queue.job"])).toEqual([
      "alice.eth",
      "alice.eth",
      "alice.eth"
    ])
    expect(spans.map(({ attributes }) => attributes["retry_queue.worker"])).toEqual([
      "worker-a",
      "worker-a",
      "<none>"
    ])
    expect(spans.map(({ attributes }) => attributes["retry_queue.sequence"])).toEqual([1, 2, 3])
    expect(spans.map(({ attributes }) => attributes["retry_queue.placement"])).toEqual([
      "commit",
      "commit",
      "commit"
    ])
    expect(spans.every(({ attributes }) => typeof attributes["retry_queue.state_json"] === "string")).toBe(true)
    expect(spans.map(({ events }) => events.map(({ name }) => name))).toEqual([
      ["retry-queue.transition"],
      ["retry-queue.transition"],
      ["retry-queue.transition"]
    ])
  })

  it.each(["span-start", "span-end"] as const)(
    "exercises the %s instrumentation variant",
    async (traceEventPlacement) => {
      const captured = await Effect.runPromise(
        captureSpans(
          Effect.gen(function*() {
            const queue = yield* makeRenewalQueue({ traceEventPlacement })
            yield* queue.execute({ kind: "lease", job: "alice.eth", worker: "worker-a" })
            return yield* queue.trace
          })
        )
      )
      const transitions = extractSpanTransitions(captured.spans)
      expect(transitions).toHaveLength(1)
      expect(transitions[0]?.placement).toBe(traceEventPlacement)
      expect(spansToTrace(captured.spans)).toEqual(captured.value)
    }
  )
})
