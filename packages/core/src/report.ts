import { defaultLanguage, resolveLocalizedText } from "./localized-text.ts";
import { getPromiseRunStatus, type TestResult } from "./results.ts";
import {
  type FeatureReport,
  harnessProtocolVersion,
  type PromiseRecord,
  type SeedReport,
  type ValidationIssue,
} from "./schema.ts";

const issuesForPromise = (
  issues: readonly ValidationIssue[],
  promiseId: string,
): readonly ValidationIssue[] => issues.filter((issue) => issue.promiseId === promiseId);

export type SeedReportOptions = {
  readonly language?: string;
  readonly results?: readonly TestResult[];
};

export const generateSeedReport = (
  records: readonly PromiseRecord[],
  issues: readonly ValidationIssue[],
  options: SeedReportOptions = {},
): SeedReport => {
  const language = options.language ?? defaultLanguage;
  const results = options.results ?? [];
  const byFeature = new Map<string, PromiseRecord[]>();

  for (const record of records) {
    const recordsForFeature = byFeature.get(record.feature) ?? [];
    recordsForFeature.push(record);
    byFeature.set(record.feature, recordsForFeature);
  }

  const features: FeatureReport[] = [...byFeature.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([feature, featureRecords]) => ({
      feature,
      promises: featureRecords
        .toSorted((left, right) => left.id.localeCompare(right.id))
        .map((record) => ({
          evidence: record.observes,
          failureMeaning: resolveLocalizedText(record.failureMeaning, language),
          given: record.given.map((item) => resolveLocalizedText(item, language)),
          lifecycle: record.lifecycle,
          priority: record.priority,
          promiseId: record.id,
          purpose: resolveLocalizedText(record.purpose, language),
          runStatus: getPromiseRunStatus(record.id, results),
          // oxlint-disable-next-line unicorn/no-thenable -- Given / When / Then is project vocabulary.
          then: record.then.map((item) => resolveLocalizedText(item, language)),
          title: resolveLocalizedText(record.title, language),
          when: record.when.map((item) => resolveLocalizedText(item, language)),
          warnings: issuesForPromise(issues, record.id).filter(
            (issue) => issue.severity === "warning",
          ),
        })),
    }));

  return {
    apiVersion: harnessProtocolVersion,
    features,
    issues: [...issues],
    summary: {
      errors: issues.filter((issue) => issue.severity === "error").length,
      promises: records.length,
      warnings: issues.filter((issue) => issue.severity === "warning").length,
    },
  };
};

export const renderSeedReportMarkdown = (report: SeedReport): string => {
  const lines: string[] = [
    "Seed Harness Report",
    "",
    `Protocol: ${report.apiVersion}`,
    `Promises: ${report.summary.promises}`,
    `Errors: ${report.summary.errors}`,
    `Warnings: ${report.summary.warnings}`,
    "",
  ];

  for (const feature of report.features) {
    lines.push(`Feature: ${feature.feature}`, "");

    for (const promise of feature.promises) {
      lines.push(`${promise.priority}  ${promise.title}`);
      lines.push(`    Promise ID: ${promise.promiseId}`);
      lines.push(`    Lifecycle: ${promise.lifecycle}`);
      lines.push(`    Run Status: ${promise.runStatus}`);
      lines.push(`    Purpose: ${promise.purpose}`);

      if (promise.warnings.length > 0) {
        lines.push("    Warnings:");
        for (const warning of promise.warnings) {
          lines.push(`    - ${warning.message}`);
        }
      }

      lines.push("    Given:");
      for (const given of promise.given) {
        lines.push(`    - ${given}`);
      }

      lines.push("    When:");
      for (const when of promise.when) {
        lines.push(`    - ${when}`);
      }

      lines.push("    Then:");
      for (const then of promise.then) {
        lines.push(`    - ${then}`);
      }

      lines.push("    Evidence:");
      for (const evidence of promise.evidence) {
        lines.push(`    - ${evidence}`);
      }

      lines.push(`    Failure meaning: ${promise.failureMeaning}`);
      lines.push("");
    }
  }

  const globalIssues = report.issues.filter((issue) => issue.promiseId === undefined);
  if (globalIssues.length > 0) {
    lines.push("Global Issues", "");
    for (const issue of globalIssues) {
      lines.push(`- [${issue.severity}] ${issue.message}`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd() + "\n";
};
