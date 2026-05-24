import { greet } from "@test-harness/core";
import { expect, test } from "vite-plus/test";

test("greet returns a non-empty string", () => {
  expect(greet("check")).toContain("check");
});
