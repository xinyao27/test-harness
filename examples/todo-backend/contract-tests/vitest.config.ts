import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    reporters: ["default", "@test-harness/adapter-vitest/reporter"],
    testTimeout: 10_000,
  },
});
