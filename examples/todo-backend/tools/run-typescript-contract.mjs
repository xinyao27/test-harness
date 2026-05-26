#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertExamplePromiseIds,
  buildWorkspacePackages,
  exampleRoot,
  runProcess,
  runWithAdapterRuntime,
  spawnProcess,
  stopProcess,
  waitForProcessHttpOk,
} from "./lib/processes.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const backendRoot = path.join(exampleRoot, "implementations", "typescript-hono");
const contractRoot = path.join(exampleRoot, "contract-tests");
const tsxBin = path.join(backendRoot, "node_modules", ".bin", "tsx");
const host = "127.0.0.1";
const port = process.env.TODO_BACKEND_TYPESCRIPT_PORT ?? "3101";
const backendUrl = `http://${host}:${port}/todos`;
const useRuntime = !process.argv.includes("--no-runtime");
const implementationPromiseId = "todo_backend.typescript_hono.server_implements_contract";

export const runTypeScriptContract = async () => {
  await buildWorkspacePackages();
  await assertExamplePromiseIds([
    implementationPromiseId,
    "todo_backend.typescript_hono.native_tests_are_promise_bound",
  ]);

  const backend = spawnProcess(tsxBin, ["src/server.ts"], {
    cwd: backendRoot,
    env: {
      HOST: host,
      PORT: port,
    },
    stdio: ["ignore", "inherit", "inherit"],
  });

  try {
    await waitForProcessHttpOk(backend, backendUrl);
    await runProcess("pnpm", ["--dir", backendRoot, "test"], {
      env: {
        HARNESS_ROOT_DIR: exampleRoot,
      },
    });
    await runProcess("pnpm", ["--dir", contractRoot, "test"], {
      env: {
        HARNESS_ROOT_DIR: exampleRoot,
        TODO_BACKEND_IMPLEMENTATION_LABEL: "typescript-hono",
        TODO_BACKEND_IMPLEMENTATION_PROMISE_ID: implementationPromiseId,
        TODO_BACKEND_URL: backendUrl,
      },
    });
  } finally {
    await stopProcess(backend);
  }
};

try {
  if (useRuntime) {
    await runWithAdapterRuntime(scriptPath);
  } else {
    await runTypeScriptContract();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
