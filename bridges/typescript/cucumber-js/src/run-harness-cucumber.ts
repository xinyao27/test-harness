import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadConfiguration } from "@cucumber/cucumber/api";

import {
  bridgeDescriptor,
  convertCucumberMessages,
  runCucumberWithHarnessEnv,
  type CucumberMessageEnvelope,
  type ExampleResult,
} from "./index.ts";

const HARNESS_ROOT_ENV_VAR = "HARNESS_ROOT_DIR";
const HARNESS_RUN_ID_ENV_VAR = "HARNESS_RUN_ID";
const HARNESS_BRIDGE_EVENTS_DIR_ENV_VAR = "HARNESS_BRIDGE_EVENTS_DIR";

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));
const featurePath =
  "../../../features/harness/bridges/typescript/cucumber-js/typescript-cucumber-bridge/typescript-cucumber-bridge.feature";
const supportPath = join(packageDir, "features/typescript-cucumber-bridge.steps.ts");

const { runConfiguration } = await loadConfiguration({
  file: false,
  provided: {
    format: ["progress"],
    import: [supportPath],
    paths: [featurePath],
    publish: false,
  },
});

const messages: CucumberMessageEnvelope[] = [];
const result = await runCucumberWithHarnessEnv(runConfiguration, {
  env: process.env,
  environment: {
    cwd: packageDir,
    stderr: process.stderr,
    stdout: process.stdout,
  },
  onMessage: (message) => messages.push(message),
});

const converted = convertCucumberMessages({ envelopes: messages });
await recordResults(converted.results);

process.exit(result.success ? 0 : 1);

async function recordResults(results: ExampleResult[]) {
  if (!process.env[HARNESS_BRIDGE_EVENTS_DIR_ENV_VAR]) {
    return;
  }

  const rootDir = process.env[HARNESS_ROOT_ENV_VAR] ?? process.cwd();
  const runId = process.env[HARNESS_RUN_ID_ENV_VAR] ?? "default";
  const eventsDir = bridgeEventsDir(rootDir, runId);
  await mkdir(eventsDir, { recursive: true });

  await Promise.all(
    results.map((example, index) => {
      const event = {
        apiVersion: 1,
        bridge: bridgeDescriptor(),
        kind: "cucumberExampleResult",
        payload: example,
        runId,
        timestamp: generatedAt(),
      };
      const name = `${Date.now()}-${process.pid}-${index}.ndjson`;
      return writeFile(join(eventsDir, name), `${JSON.stringify(event)}\n`);
    }),
  );
}

function bridgeEventsDir(rootDir: string, runId: string) {
  const configured = process.env[HARNESS_BRIDGE_EVENTS_DIR_ENV_VAR];
  if (configured) {
    return isAbsolute(configured) ? configured : resolve(rootDir, configured);
  }
  return join(rootDir, ".harness", "runs", runId, "events");
}

function generatedAt() {
  return `unix-ms:${Date.now()}`;
}
