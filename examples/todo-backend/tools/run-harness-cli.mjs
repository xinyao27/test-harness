#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const exampleRoot = path.resolve(path.dirname(scriptPath), "..");
const repoRoot = path.resolve(exampleRoot, "../..");
const harnessCli = path.join(repoRoot, "target", "debug", "harness-cli");

const run = (command, args, options = {}) =>
  new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? repoRoot,
      env: process.env,
      stdio: "inherit",
    });
    child.on("exit", (code, signal) => {
      resolve(signal ? 1 : (code ?? 1));
    });
  });

const buildStatus = await run("cargo", ["build", "--quiet", "-p", "harness-cli"]);
if (buildStatus !== 0) {
  process.exit(buildStatus);
}

const status = await run(harnessCli, process.argv.slice(2), { cwd: exampleRoot });
process.exit(status);
