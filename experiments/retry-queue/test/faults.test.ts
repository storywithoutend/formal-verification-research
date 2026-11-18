import { describe, expect, it } from "vitest"
import { plantedFaultTraces } from "../src/faults.js"
import { validateTracePure } from "../src/model.js"

describe("planted implementation faults", () => {
  for (const [name, makeTrace] of Object.entries(plantedFaultTraces)) {
    it(`rejects ${name}`, () => {
      const result = validateTracePure(makeTrace())
      expect(result.ok).toBe(false)
    })
  }
})
