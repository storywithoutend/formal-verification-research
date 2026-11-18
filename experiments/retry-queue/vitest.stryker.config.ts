import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["test/queue.test.ts", "test/model-based.test.ts"],
    testTimeout: 20_000
  }
})
