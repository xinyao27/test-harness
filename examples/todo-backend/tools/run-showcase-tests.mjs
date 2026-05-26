#!/usr/bin/env node
import path from "node:path";

import { buildWorkspacePackages, exampleRoot, runProcess } from "./lib/processes.mjs";

const showcaseTestsRoot = path.join(exampleRoot, "showcase-tests");

try {
  if (!process.env.HARNESS_RUN_ID || !process.env.HARNESS_ADAPTER_EVENTS_DIR) {
    console.log("No active Harness run detected; running the full Todo-Backend demo instead.");
    await runProcess("pnpm", ["example:todo:test"]);
  } else {
    await buildWorkspacePackages();
    await runProcess("pnpm", ["--dir", showcaseTestsRoot, "test"], {
      env: {
        HARNESS_ROOT_DIR: exampleRoot,
        TODO_SHOWCASE_TESTS_REQUIRED: "1",
      },
    });
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
