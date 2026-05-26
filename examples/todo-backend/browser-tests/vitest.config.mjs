import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 30_000,
    reporters: [
      "default",
      [
        "@test-harness/adapter-vitest/reporter",
        {
          outputFile: ".harness/vitest-browser-results.yaml",
        },
      ],
    ],
  },
});
