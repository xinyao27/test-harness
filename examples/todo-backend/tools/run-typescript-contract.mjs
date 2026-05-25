#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const exampleRoot = path.resolve(path.dirname(scriptPath), "..");
const repoRoot = path.resolve(exampleRoot, "../..");
const backendRoot = path.join(exampleRoot, "implementations", "typescript-hono");
const contractRoot = path.join(exampleRoot, "contract-tests");
const tsxBin = path.join(backendRoot, "node_modules", ".bin", "tsx");
const host = "127.0.0.1";
const port = process.env.TODO_BACKEND_TYPESCRIPT_PORT ?? "3101";
const backendUrl = `http://${host}:${port}/todos`;

const spawnProcess = (command, args, options = {}) =>
  spawn(command, args, {
    cwd: options.cwd ?? repoRoot,
    env: {
      ...process.env,
      ...options.env,
    },
    stdio: options.stdio ?? "inherit",
  });

const waitForBackend = async () => {
  const deadline = Date.now() + 10_000;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(backendUrl);
      if (response.ok) return;
      lastError = new Error(`GET ${backendUrl} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw lastError ?? new Error(`Timed out waiting for ${backendUrl}`);
};

const waitForExit = (child) =>
  new Promise((resolve) => {
    child.on("exit", (code, signal) => {
      if (signal) {
        resolve(1);
        return;
      }
      resolve(code ?? 1);
    });
  });

const stopProcess = async (child) => {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    waitForExit(child),
    new Promise((resolve) => {
      setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill("SIGKILL");
        }
        resolve(undefined);
      }, 2_000);
    }),
  ]);
};

const backend = spawnProcess(tsxBin, ["src/server.ts"], {
  cwd: backendRoot,
  env: {
    HOST: host,
    PORT: port,
  },
  stdio: ["ignore", "inherit", "inherit"],
});

try {
  await waitForBackend();
  const contract = spawnProcess(
    "cargo",
    [
      "run",
      "--quiet",
      "-p",
      "harness-adapter-runtime",
      "--",
      "run",
      "--",
      "sh",
      "-c",
      `pnpm --dir "${backendRoot}" test && pnpm --dir "${contractRoot}" test`,
    ],
    {
      env: {
        HARNESS_ROOT_DIR: exampleRoot,
        TODO_BACKEND_IMPLEMENTATION_PROMISE_ID:
          "todo_backend.typescript_hono.server_implements_contract",
        TODO_BACKEND_URL: backendUrl,
      },
    },
  );
  process.exitCode = await waitForExit(contract);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await stopProcess(backend);
}
