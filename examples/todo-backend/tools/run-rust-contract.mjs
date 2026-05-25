#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  exampleRoot,
  repoRoot,
  runProcess,
  runWithAdapterRuntime,
  spawnProcess,
  stopProcess,
  waitForHttpOk,
} from "./lib/processes.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const contractRoot = path.join(exampleRoot, "contract-tests");
const host = "127.0.0.1";
const port = process.env.TODO_BACKEND_RUST_PORT ?? "3102";
const backendUrl = `http://${host}:${port}/todos`;
const binaryPath = path.join(repoRoot, "target", "debug", "todo-backend-rust-axum");
const useRuntime = !process.argv.includes("--no-runtime");

export const runRustContract = async () => {
  await runProcess("cargo", ["build", "--quiet", "-p", "todo-backend-rust-axum"]);

  const backend = spawnProcess(binaryPath, [], {
    env: {
      HOST: host,
      PORT: port,
    },
    stdio: ["ignore", "inherit", "inherit"],
  });

  try {
    await waitForHttpOk(backendUrl);
    await runProcess(
      "sh",
      [
        "-c",
        `TODO_BACKEND_RUST_NATIVE_TESTS=1 cargo test --quiet -p todo-backend-rust-axum && pnpm --dir "${contractRoot}" test`,
      ],
      {
        env: {
          HARNESS_ROOT_DIR: exampleRoot,
          TODO_BACKEND_IMPLEMENTATION_PROMISE_ID:
            "todo_backend.rust_axum.server_implements_contract",
          TODO_BACKEND_URL: backendUrl,
        },
      },
    );
  } finally {
    await stopProcess(backend);
  }
};

try {
  if (useRuntime) {
    await runWithAdapterRuntime(scriptPath);
  } else {
    await runRustContract();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
