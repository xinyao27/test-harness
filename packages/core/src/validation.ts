import {
  hasDefaultLanguageText,
  isLocalizedTextBlank,
  resolveLocalizedText,
} from "./localized-text.ts";
import type { TestResult } from "./results.ts";
import { type PromiseRecord, type ScenarioBinding, type ValidationIssue } from "./schema.ts";

const idPattern = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;

const isBlank = (value: string): boolean => value.trim().length === 0;

const hasReviewApproval = (record: PromiseRecord): boolean =>
  Boolean(record.review.approvedBy?.trim() || record.review.approvedIn?.trim());

export const validatePromiseRecords = (
  records: readonly PromiseRecord[],
): readonly ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  const seen = new Set<string>();

  for (const record of records) {
    if (seen.has(record.id)) {
      issues.push({
        code: "duplicate_promise_id",
        message: `Duplicate promise id "${record.id}".`,
        promiseId: record.id,
        severity: "error",
      });
    }
    seen.add(record.id);

    if (!idPattern.test(record.id)) {
      issues.push({
        code: "invalid_promise_id",
        message: `Promise id "${record.id}" must be stable, lowercase, and dot/underscore/hyphen separated.`,
        promiseId: record.id,
        severity: "error",
      });
    }

    for (const [field, value] of [
      ["title", record.title],
      ["purpose", record.purpose],
      ["failureMeaning", record.failureMeaning],
    ] as const) {
      if (isLocalizedTextBlank(value)) {
        issues.push({
          code: "blank_required_field",
          message: `Promise "${record.id}" has a blank ${field}.`,
          promiseId: record.id,
          severity: "error",
        });
      }

      if (!hasDefaultLanguageText(value)) {
        issues.push({
          code: "missing_default_language",
          message: `Promise "${record.id}" should include non-blank en text for ${field}.`,
          promiseId: record.id,
          severity: "warning",
        });
      }
    }

    if (isBlank(record.feature)) {
      issues.push({
        code: "blank_required_field",
        message: `Promise "${record.id}" has a blank feature.`,
        promiseId: record.id,
        severity: "error",
      });
    }

    for (const [field, values] of [
      ["given", record.given],
      ["when", record.when],
      ["then", record.then],
    ] as const) {
      if (values.length === 0) {
        issues.push({
          code: "empty_required_list",
          message: `Promise "${record.id}" must include at least one ${field} item.`,
          promiseId: record.id,
          severity: "error",
        });
      }
      for (const [index, value] of values.entries()) {
        if (isLocalizedTextBlank(value)) {
          issues.push({
            code: "blank_required_list_item",
            message: `Promise "${record.id}" has a blank ${field}[${index}] item.`,
            promiseId: record.id,
            severity: "error",
          });
        }

        if (!hasDefaultLanguageText(value)) {
          issues.push({
            code: "missing_default_language",
            message: `Promise "${record.id}" should include non-blank en text for ${field}[${index}].`,
            promiseId: record.id,
            severity: "warning",
          });
        }
      }
    }

    if (record.observes.length === 0) {
      issues.push({
        code: "empty_required_list",
        message: `Promise "${record.id}" must include at least one observes item.`,
        promiseId: record.id,
        severity: "error",
      });
    }

    for (const [index, value] of record.observes.entries()) {
      if (isBlank(value)) {
        issues.push({
          code: "blank_required_list_item",
          message: `Promise "${record.id}" has a blank observes[${index}] item.`,
          promiseId: record.id,
          severity: "error",
        });
      }
    }

    if (/^(works|returns expected value)$/i.test(resolveLocalizedText(record.title).trim())) {
      issues.push({
        code: "vague_title",
        message: `Promise "${record.id}" has a vague title.`,
        promiseId: record.id,
        severity: "error",
      });
    }

    if (record.lifecycle === "accepted" && !hasReviewApproval(record)) {
      issues.push({
        code: "missing_review_metadata",
        message: `Accepted promise "${record.id}" should include review.approvedBy or review.approvedIn.`,
        promiseId: record.id,
        severity: "warning",
      });
    }
  }

  return issues;
};

export const validateScenarioBindings = (
  records: readonly PromiseRecord[],
  bindings: readonly ScenarioBinding[],
): readonly ValidationIssue[] => {
  const promiseIds = new Set(records.map((record) => record.id));
  return bindings.flatMap((binding) => {
    if (promiseIds.has(binding.id)) return [];
    return [
      {
        code: "unknown_scenario_binding",
        message: `Scenario binding "${binding.id}" does not match any canonical promise.`,
        promiseId: binding.id,
        severity: "error",
      },
    ];
  });
};

export const validateTestResults = (
  records: readonly PromiseRecord[],
  results: readonly TestResult[],
): readonly ValidationIssue[] => {
  const promiseIds = new Set(records.map((record) => record.id));
  const resultPromiseIds = new Set(results.map((result) => result.promiseId));
  const issues: ValidationIssue[] = records.flatMap((record) => {
    if (record.lifecycle === "implemented" && !resultPromiseIds.has(record.id)) {
      return [
        {
          code: "missing_test_result",
          message: `Implemented promise "${record.id}" has no collected test result.`,
          promiseId: record.id,
          severity: "warning",
        },
      ];
    }
    return [];
  });

  const unknownResultIssues: ValidationIssue[] = results.flatMap((result): ValidationIssue[] => {
    if (promiseIds.has(result.promiseId)) return [];
    return [
      {
        code: "unknown_result_binding",
        message: `Test result binding "${result.promiseId}" does not match any canonical promise.`,
        promiseId: result.promiseId,
        severity: "error",
      },
    ];
  });

  issues.push(...unknownResultIssues);

  return issues;
};
