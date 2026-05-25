import { spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

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

export const buildWorkspacePackages = async () => {
  if (process.env.TODO_BACKEND_WORKSPACE_PACKAGES_BUILT === "1") return;

  await runProcess("pnpm", ["build"]);
  process.env.TODO_BACKEND_WORKSPACE_PACKAGES_BUILT = "1";
};

const hasExited = (child) => child.exitCode !== null || child.signalCode !== null;

export const stopProcess = async (child) => {
  if (hasExited(child)) return;

  child.kill("SIGTERM");
  await Promise.race([
    waitForExit(child),
    new Promise((resolve) => {
      setTimeout(() => {
        if (!hasExited(child)) {
          child.kill("SIGKILL");
        }
        resolve(undefined);
      }, 2_000);
    }),
  ]);
};

export const waitForProcessHttpOk = async (child, url, options = {}) => {
  const deadline = Date.now() + (options.timeoutMs ?? 15_000);
  let lastError;

  while (Date.now() < deadline) {
    if (hasExited(child)) {
      throw new Error(`Process exited before ${url} became ready.`);
    }

    try {
      const response = await fetch(url);
      if (response.ok) {
        await new Promise((resolve) => setTimeout(resolve, options.stabilityWindowMs ?? 50));
        if (hasExited(child)) {
          throw new Error(`Process exited after ${url} responded once.`);
        }
        return;
      }
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

export const mergeCurrentAdapterEvents = async () => {
  const runId = process.env.HARNESS_RUN_ID;
  if (!runId) return;

  await runProcess(
    "cargo",
    ["run", "--quiet", "-p", "harness-adapter-runtime", "--", "merge", runId],
    {
      env: {
        HARNESS_ROOT_DIR: exampleRoot,
      },
    },
  );
};

const collectPromiseFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectPromiseFiles(entryPath)));
    } else if (
      entry.isFile() &&
      (entry.name.endsWith(".promise.yaml") || entry.name.endsWith(".promises.yaml"))
    ) {
      files.push(entryPath);
    }
  }

  return files;
};

export const assertExamplePromiseIds = async (promiseIds) => {
  const examplePromiseIds = new Set();
  const promiseFiles = await collectPromiseFiles(path.join(exampleRoot, "promises"));

  for (const promiseFile of promiseFiles) {
    const relativePromiseFile = path.relative(exampleRoot, promiseFile);
    const document = parse(await readFile(promiseFile, "utf8"));
    if (document?.apiVersion !== 1) {
      throw new Error(`${relativePromiseFile} must use apiVersion: 1`);
    }

    for (const [index, promise] of (document.promises ?? []).entries()) {
      if (typeof promise?.id !== "string" || promise.id.trim() === "") {
        throw new Error(`${relativePromiseFile}.promises[${String(index)}].id must be present`);
      }
      examplePromiseIds.add(promise.id);
    }
  }

  const missingPromiseIds = promiseIds.filter((promiseId) => !examplePromiseIds.has(promiseId));
  if (missingPromiseIds.length > 0) {
    throw new Error(`Unknown Todo-Backend promise id(s): ${missingPromiseIds.join(", ")}`);
  }
};
