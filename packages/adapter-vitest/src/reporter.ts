import {
  createTestResultsFile,
  harnessRootEnvVar,
  type TestResult,
  type TestResultStatus,
  writeTestResultsFile,
} from "@test-harness/core";
import type { Reporter } from "vite-plus/test/reporters";

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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const promiseIdOf = (meta: unknown): string | undefined => {
  if (!isRecord(meta)) return undefined;
  return typeof meta.promiseId === "string" ? meta.promiseId : undefined;
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
      const promiseId = promiseIdOf(testCase.meta?.());
      const status = statusOf(result);
      if (!promiseId || !status) continue;

      results.push({
        ...(status === "failing" ? { failureMessage: failureMessageOf(result?.errors) } : {}),
        file: testCase.module?.moduleId ?? module.moduleId ?? module.relativeModuleId ?? "",
        promiseId,
        status,
        testName: testCase.fullName ?? testCase.name ?? "Unnamed test",
      });
    }
  }

  return results;
};

export default class HarnessReporter implements Reporter {
  async onTestRunEnd(
    testModules: Parameters<NonNullable<Reporter["onTestRunEnd"]>>[0],
  ): Promise<void> {
    await writeTestResultsFile(
      process.env[harnessRootEnvVar] ?? process.cwd(),
      createTestResultsFile(collectTestResultsFromModules(testModules)),
    );
  }
}
