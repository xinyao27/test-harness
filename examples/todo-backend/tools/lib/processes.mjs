import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const libraryPath = fileURLToPath(import.meta.url);

export const exampleRoot = path.resolve(path.dirname(libraryPath), "../..");
export const repoRoot = path.resolve(exampleRoot, "../..");

export const spawnProcess = (command, args, options = {}) => {
  const child = spawn(command, args, {
    cwd: options.cwd ?? repoRoot,
    env: {
      ...process.env,
      ...options.env,
    },
    stdio: options.stdio ?? "inherit",
  });
  child.on("error", (error) => {
    console.error(`${command} failed to start: ${error.message}`);
  });
  return child;
};

export const waitForExit = (child) =>
  new Promise((resolve) => {
    child.on("error", () => {
      resolve(1);
    });
    child.on("exit", (code, signal) => {
      resolve(signal ? 1 : (code ?? 1));
    });
  });

export const runProcess = async (command, args, options = {}) => {
  const child = spawnProcess(command, args, options);
  const exitCode = await waitForExit(child);
  if (exitCode !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${String(exitCode)}`);
  }
};

export const stopProcess = async (child) => {
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

export const waitForHttpOk = async (url, options = {}) => {
  const deadline = Date.now() + (options.timeoutMs ?? 15_000);
  let lastError;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`GET ${url} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw lastError ?? new Error(`Timed out waiting for ${url}`);
};

export const runWithAdapterRuntime = async (scriptPath, args = [], env = {}) => {
  await runProcess(
    "cargo",
    [
      "run",
      "--quiet",
      "-p",
      "harness-adapter-runtime",
      "--",
      "run",
      "--",
      "node",
      scriptPath,
      "--no-runtime",
      ...args,
    ],
    {
      env: {
        HARNESS_ROOT_DIR: exampleRoot,
        ...env,
      },
    },
  );
};
