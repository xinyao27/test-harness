#!/usr/bin/env node
import { fileURLToPath } from "node:url";

import { runProcess, runWithAdapterRuntime } from "./lib/processes.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const useRuntime = !process.argv.includes("--no-runtime");

const runScript = async (...args) => {
  await runProcess("node", args);
};

export const runTodoBackendSuite = async () => {
  await runProcess("pnpm", ["example:todo:check"]);
  await runScript("examples/todo-backend/tools/run-typescript-contract.mjs", "--no-runtime");
  await runScript("examples/todo-backend/tools/run-rust-contract.mjs", "--no-runtime");
  await runScript(
    "examples/todo-backend/tools/run-browser-e2e.mjs",
    "--backend",
    "typescript",
    "--no-runtime",
  );
  await runScript(
    "examples/todo-backend/tools/run-browser-e2e.mjs",
    "--backend",
    "rust",
    "--no-runtime",
  );
};

try {
  if (useRuntime) {
    await runWithAdapterRuntime(scriptPath);
  } else {
    await runTodoBackendSuite();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
