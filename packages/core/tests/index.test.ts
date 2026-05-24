import { expect, test } from "vite-plus/test";

import { greet } from "../src/index.ts";

test("greet wraps the command name", () => {
  expect(greet("check")).toBe("[harness] check — seed harness placeholder");
});
