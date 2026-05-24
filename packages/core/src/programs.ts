import { Effect } from "effect";

import type { HarnessError } from "./errors.ts";
import { loadPromiseRecords } from "./promise-registry.ts";
import { generateSeedReport, type SeedReportOptions } from "./report.ts";
import { loadTestResults } from "./results.ts";
import { getScenarioBindings } from "./scenario.ts";
import type { PromiseRecord, SeedReport, ValidationIssue } from "./schema.ts";
import {
  validatePromiseRecords,
  validateScenarioBindings,
  validateTestResults,
} from "./validation.ts";

export type SeedCheckResult = {
  readonly issues: readonly ValidationIssue[];
  readonly records: readonly PromiseRecord[];
};

export const checkSeedHarness = (rootDir: string): Effect.Effect<SeedCheckResult, HarnessError> =>
  Effect.gen(function* () {
    const records = yield* loadPromiseRecords(rootDir);
    const issues = [
      ...validatePromiseRecords(records),
      ...validateScenarioBindings(records, getScenarioBindings()),
    ];
    return { issues, records };
  });

export const buildSeedReport = (
  rootDir: string,
  options: SeedReportOptions = {},
): Effect.Effect<SeedReport, HarnessError> =>
  Effect.gen(function* () {
    const result = yield* checkSeedHarness(rootDir);
    const results = options.results ?? (yield* loadTestResults(rootDir));
    const issues = [...result.issues, ...validateTestResults(result.records, results)];
    return generateSeedReport(result.records, issues, { ...options, results });
  });
