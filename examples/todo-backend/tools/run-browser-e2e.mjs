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
const clientRoot = path.join(exampleRoot, "client", "todomvc-react");
const browserTestsRoot = path.join(exampleRoot, "browser-tests");
const typescriptRoot = path.join(exampleRoot, "implementations", "typescript-hono");
const tsxBin = path.join(typescriptRoot, "node_modules", ".bin", "tsx");
const viteBin = path.join(repoRoot, "node_modules", ".bin", "vite");
const rustBinaryPath = path.join(repoRoot, "target", "debug", "todo-backend-rust-axum");
const host = "127.0.0.1";
const clientPort = process.env.TODO_CLIENT_PORT ?? "3100";
const clientUrl = `http://${host}:${clientPort}`;
const useRuntime = !process.argv.includes("--no-runtime");

const backendName = (() => {
  const index = process.argv.indexOf("--backend");
  return index >= 0 ? process.argv[index + 1] : "typescript";
})();

const backendConfigs = {
  rust: {
    port: process.env.TODO_BACKEND_RUST_PORT ?? "3102",
    promiseId: "todo_backend.rust_axum.server_implements_contract",
    start: async (backendUrl) => {
      await runProcess("cargo", ["build", "--quiet", "-p", "todo-backend-rust-axum"]);
      return spawnProcess(rustBinaryPath, [], {
        env: {
          HOST: host,
          PORT: new URL(backendUrl).port,
        },
        stdio: ["ignore", "inherit", "inherit"],
      });
    },
  },
  typescript: {
    port: process.env.TODO_BACKEND_TYPESCRIPT_PORT ?? "3101",
    promiseId: "todo_backend.typescript_hono.server_implements_contract",
    start: async (backendUrl) =>
      spawnProcess(tsxBin, ["src/server.ts"], {
        cwd: typescriptRoot,
        env: {
          HOST: host,
          PORT: new URL(backendUrl).port,
        },
        stdio: ["ignore", "inherit", "inherit"],
      }),
  },
};

const backendConfig = backendConfigs[backendName];
if (!backendConfig) {
  console.error(
    `Unknown backend "${backendName}". Expected one of: ${Object.keys(backendConfigs).join(", ")}`,
  );
  process.exit(1);
}

const backendUrl = `http://${host}:${backendConfig.port}/todos`;

export const runBrowserE2e = async () => {
  const backend = await backendConfig.start(backendUrl);
  let client;

  try {
    await waitForHttpOk(backendUrl);
    client = spawnProcess(viteBin, ["--host", host, "--port", clientPort, "--strictPort"], {
      cwd: clientRoot,
      env: {
        VITE_TODO_BACKEND_URL: backendUrl,
      },
      stdio: ["ignore", "inherit", "inherit"],
    });
    await waitForHttpOk(clientUrl);

    await runProcess("pnpm", ["--dir", browserTestsRoot, "test"], {
      env: {
        HARNESS_ROOT_DIR: exampleRoot,
        TODO_BACKEND_IMPLEMENTATION_PROMISE_ID: backendConfig.promiseId,
        TODO_BACKEND_URL: backendUrl,
        TODO_CLIENT_URL: clientUrl,
      },
    });
  } finally {
    if (client) {
      await stopProcess(client);
    }
    await stopProcess(backend);
  }
};

try {
  if (useRuntime) {
    await runWithAdapterRuntime(scriptPath, ["--backend", backendName]);
  } else {
    await runBrowserE2e();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
