import { Effect } from "effect";

import { loadHarnessConfig } from "./config.ts";
import type { HarnessError } from "./errors.ts";
import { findSourceFiles, loadModuleRecords } from "./module-registry.ts";
import { loadPromiseRecords } from "./promise-registry.ts";
import { generateSeedReport, type SeedReportOptions } from "./report.ts";
import { loadTestResults } from "./results.ts";
import { getScenarioBindings } from "./scenario.ts";
import type { ModuleRecord, PromiseRecord, SeedReport, ValidationIssue } from "./schema.ts";
import {
  validateModuleCoverage,
  validatePromiseRecords,
  validateScenarioBindings,
  validateTestResults,
} from "./validation.ts";

export type SeedCheckResult = {
  readonly issues: readonly ValidationIssue[];
  readonly modules: readonly ModuleRecord[];
  readonly records: readonly PromiseRecord[];
};

export const checkSeedHarness = (rootDir: string): Effect.Effect<SeedCheckResult, HarnessError> =>
  Effect.gen(function* () {
    yield* loadHarnessConfig(rootDir);
    const records = yield* loadPromiseRecords(rootDir);
    const modules = yield* loadModuleRecords(rootDir);
    const sourceFiles = yield* findSourceFiles(rootDir);
    const issues = [
      ...validatePromiseRecords(records),
      ...validateScenarioBindings(records, getScenarioBindings()),
      ...validateModuleCoverage(modules, sourceFiles),
    ];
    return { issues, modules, records };
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
