import { Schema } from "effect";

export const harnessProtocolVersion = 1 as const;
export const HarnessProtocolVersionSchema = Schema.Literals([harnessProtocolVersion]);

export const PromiseLifecycleSchema = Schema.Literals([
  "proposed",
  "accepted",
  "implemented",
  "changed_requires_review",
  "deprecated",
]);

export const PromiseRunStatusSchema = Schema.Literals([
  "unknown",
  "passing",
  "failing",
  "skipped",
  "missing_evidence",
  "evidence_drifted",
]);

export const PromisePrioritySchema = Schema.Literals(["P0", "P1", "P2"]);

export const PromiseBoundarySchema = Schema.Literals([
  "unit",
  "integration",
  "browser",
  "e2e",
  "adapter",
]);

const StringArraySchema = Schema.Array(Schema.String);
const NonEmptyStringArraySchema = StringArraySchema.check(Schema.isNonEmpty());
const idPattern = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const PromiseIdSchema = Schema.String.check(Schema.isPattern(idPattern));
const ModuleIdSchema = Schema.String.check(Schema.isPattern(idPattern));
export const LocalizedTextSchema = Schema.Union([
  Schema.String,
  Schema.Record(Schema.String, Schema.String),
]);
const LocalizedTextArraySchema = Schema.Array(LocalizedTextSchema).check(Schema.isNonEmpty());

export const PromiseReviewSchema = Schema.Struct({
  approvedAt: Schema.optionalKey(Schema.String),
  approvedBy: Schema.optionalKey(Schema.String),
  approvedIn: Schema.optionalKey(Schema.String),
  notes: Schema.optionalKey(Schema.String),
});

export const PromiseRecordSchema = Schema.Struct({
  apiVersion: HarnessProtocolVersionSchema,
  boundary: PromiseBoundarySchema,
  deprecatedBy: Schema.optionalKey(Schema.String),
  failureMeaning: LocalizedTextSchema,
  feature: Schema.String,
  given: LocalizedTextArraySchema,
  id: PromiseIdSchema,
  lifecycle: PromiseLifecycleSchema,
  observes: NonEmptyStringArraySchema,
  priority: PromisePrioritySchema,
  purpose: LocalizedTextSchema,
  review: PromiseReviewSchema,
  supersedes: Schema.optionalKey(StringArraySchema),
  // oxlint-disable-next-line unicorn/no-thenable -- Given / When / Then is project vocabulary.
  then: LocalizedTextArraySchema,
  title: LocalizedTextSchema,
  when: LocalizedTextArraySchema,
});

export const ModuleRecordSchema = Schema.Struct({
  apiVersion: HarnessProtocolVersionSchema,
  covers: NonEmptyStringArraySchema,
  id: ModuleIdSchema,
  promises: Schema.Array(PromiseIdSchema).check(Schema.isNonEmpty()),
  purpose: LocalizedTextSchema,
  summary: LocalizedTextSchema,
  title: LocalizedTextSchema,
});

export const ScenarioBindingSchema = Schema.Struct({
  evidence: Schema.optionalKey(StringArraySchema),
  id: Schema.String,
});

export const ValidationSeveritySchema = Schema.Literals(["error", "warning"]);

export const ValidationIssueSchema = Schema.Struct({
  code: Schema.String,
  message: Schema.String,
  path: Schema.optionalKey(Schema.String),
  promiseId: Schema.optionalKey(Schema.String),
  severity: ValidationSeveritySchema,
});

export const PromiseReportItemSchema = Schema.Struct({
  evidence: StringArraySchema,
  failureMeaning: Schema.String,
  given: StringArraySchema,
  lifecycle: PromiseLifecycleSchema,
  priority: PromisePrioritySchema,
  promiseId: Schema.String,
  purpose: Schema.String,
  runStatus: PromiseRunStatusSchema,
  // oxlint-disable-next-line unicorn/no-thenable -- Given / When / Then is project vocabulary.
  then: StringArraySchema,
  title: Schema.String,
  when: StringArraySchema,
  warnings: Schema.Array(ValidationIssueSchema),
});

export const FeatureReportSchema = Schema.Struct({
  feature: Schema.String,
  promises: Schema.Array(PromiseReportItemSchema),
});

export const SeedReportSchema = Schema.Struct({
  apiVersion: HarnessProtocolVersionSchema,
  features: Schema.Array(FeatureReportSchema),
  issues: Schema.Array(ValidationIssueSchema),
  summary: Schema.Struct({
    errors: Schema.Number,
    promises: Schema.Number,
    warnings: Schema.Number,
  }),
});

export type FeatureReport = Schema.Schema.Type<typeof FeatureReportSchema>;
export type LocalizedText = Schema.Schema.Type<typeof LocalizedTextSchema>;
export type ModuleRecord = Schema.Schema.Type<typeof ModuleRecordSchema>;
export type PromiseRecord = Schema.Schema.Type<typeof PromiseRecordSchema>;
export type PromiseReportItem = Schema.Schema.Type<typeof PromiseReportItemSchema>;
export type PromiseRunStatus = Schema.Schema.Type<typeof PromiseRunStatusSchema>;
export type ScenarioBinding = Schema.Schema.Type<typeof ScenarioBindingSchema>;
export type SeedReport = Schema.Schema.Type<typeof SeedReportSchema>;
export type ValidationIssue = Schema.Schema.Type<typeof ValidationIssueSchema>;
