import { mkdir, rename, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

import type { Reporter } from "vitest/reporters";

export const harnessRootEnvVar = "HARNESS_ROOT_DIR";
export const harnessRunIdEnvVar = "HARNESS_RUN_ID";
export const harnessAdapterEventsDirEnvVar = "HARNESS_ADAPTER_EVENTS_DIR";

type ReporterTestModuleLike = {
  readonly children?: {
    readonly allTests?: () => Iterable<ReporterTestCaseLike>;
  };
  readonly moduleId?: string;
  readonly relativeModuleId?: string;
};

type ReporterTestCaseLike = {
  readonly fullName?: string;
  readonly meta?: () => unknown;
  readonly module?: {
    readonly moduleId?: string;
    readonly relativeModuleId?: string;
  };
  readonly name?: string;
  readonly result?: () => {
    readonly errors?: readonly unknown[];
    readonly state?: string;
  };
};

export type TestResultStatus = "failing" | "passing" | "skipped";

export type TestResult = {
  readonly failureMessage?: string;
  readonly file: string;
  readonly labels?: Record<string, string>;
  readonly promiseId: string;
  readonly status: TestResultStatus;
  readonly testName: string;
};

export type AdapterEvent = {
  readonly adapter: {
    readonly framework?: string;
    readonly name: string;
    readonly version: string;
  };
  readonly apiVersion: 1;
  readonly kind: "testResult";
  readonly payload: TestResult;
  readonly runId: string;
  readonly timestamp: string;
};

const adapterName = "harness-adapter-vitest";
const adapterVersion = "0.0.0";
const defaultRunId = "default";
let shardCounter = 0;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const promiseIdOf = (meta: unknown): string | undefined => {
  if (!isRecord(meta)) return undefined;
  return typeof meta.promiseId === "string" ? meta.promiseId : undefined;
};

const labelsOf = (meta: unknown): Record<string, string> | undefined => {
  if (!isRecord(meta)) return undefined;

  const labels = isRecord(meta.labels)
    ? Object.fromEntries(
        Object.entries(meta.labels).filter(
          (entry): entry is [string, string] =>
            entry[0].trim().length > 0 &&
            typeof entry[1] === "string" &&
            entry[1].trim().length > 0,
        ),
      )
    : {};

  if (typeof meta.implementation === "string" && meta.implementation.trim().length > 0) {
    labels.implementation = meta.implementation;
  }

  return Object.keys(labels).length > 0 ? labels : undefined;
};

const messageOf = (value: unknown): string | undefined => {
  if (value instanceof Error) return value.message;
  if (isRecord(value) && typeof value.message === "string") return value.message;
  if (typeof value === "string") return value;
  return undefined;
};

const failureMessageOf = (errors: readonly unknown[] | undefined): string | undefined => {
  if (!errors || errors.length === 0) return undefined;
  return errors.map((error) => messageOf(error) ?? String(error)).join("\n");
};

type TestCaseResultLike = {
  readonly errors?: readonly unknown[];
  readonly state?: string;
};

const statusOf = (result: TestCaseResultLike | undefined): TestResultStatus | undefined => {
  if (result?.state === "pass") return "passing";
  if (result?.state === "passed") return "passing";
  if (result?.state === "fail") return "failing";
  if (result?.state === "failed") return "failing";
  if (result?.state === "skip" || result?.state === "todo") return "skipped";
  if (result?.state === "skipped") return "skipped";
  return undefined;
};

export const collectTestResultsFromModules = (
  modules: readonly ReporterTestModuleLike[],
): readonly TestResult[] => {
  const results: TestResult[] = [];

  for (const module of modules) {
    for (const testCase of module.children?.allTests?.() ?? []) {
      const result = testCase.result?.();
      const meta = testCase.meta?.();
      const promiseId = promiseIdOf(meta);
      const labels = labelsOf(meta);
      const status = statusOf(result);
      if (!promiseId || !status) continue;

      results.push({
        ...(status === "failing" ? { failureMessage: failureMessageOf(result?.errors) } : {}),
        file: testCase.module?.moduleId ?? module.moduleId ?? module.relativeModuleId ?? "",
        ...(labels ? { labels } : {}),
        promiseId,
        status,
        testName: testCase.fullName ?? testCase.name ?? "Unnamed test",
      });
    }
  }

  return results;
};

export const createAdapterEvents = (
  results: readonly TestResult[],
  options: {
    readonly runId: string;
    readonly timestamp?: string;
  },
): readonly AdapterEvent[] => {
  const timestamp = options.timestamp ?? new Date().toISOString();
  return results.map((result) => ({
    adapter: {
      framework: "vitest",
      name: adapterName,
      version: adapterVersion,
    },
    apiVersion: 1,
    kind: "testResult",
    payload: result,
    runId: options.runId,
    timestamp,
  }));
};

export const resolveAdapterEventsDir = (rootDir: string, runId: string): string => {
  const configured = process.env[harnessAdapterEventsDirEnvVar];
  if (configured) {
    return isAbsolute(configured) ? configured : join(rootDir, configured);
  }
  return join(rootDir, ".harness", "runs", runId, "events");
};

export const writeAdapterEvents = async (
  rootDir: string,
  events: readonly AdapterEvent[],
): Promise<string | undefined> => {
  if (events.length === 0) return undefined;
  const runId = events[0]?.runId ?? defaultRunId;
  const directory = resolveAdapterEventsDir(rootDir, runId);
  await mkdir(directory, { recursive: true });
  const name = `${Date.now()}-${process.pid}-${shardCounter++}`;
  const path = join(directory, `${name}.ndjson`);
  const temporaryPath = join(directory, `${name}.tmp`);
  const raw = `${events.map((event) => JSON.stringify(event)).join("\n")}\n`;
  await writeFile(temporaryPath, raw);
  await rename(temporaryPath, path);
  return path;
};

const currentRunId = (): string => process.env[harnessRunIdEnvVar] ?? defaultRunId;

export default class HarnessReporter implements Reporter {
  async onTestRunEnd(
    testModules: Parameters<NonNullable<Reporter["onTestRunEnd"]>>[0],
  ): Promise<void> {
    const rootDir = process.env[harnessRootEnvVar] ?? process.cwd();
    const runId = currentRunId();
    const results = collectTestResultsFromModules(testModules);
    const events = createAdapterEvents(results, { runId });
    await writeAdapterEvents(rootDir, events);
  }
}
