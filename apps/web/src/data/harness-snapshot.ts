// oxlint-disable unicorn/no-thenable

import type { LocalizedText } from "@/lib/localized-text";

export type BehaviorState =
  | "accepted"
  | "changes_requested"
  | "deprecated"
  | "draft"
  | "proposed"
  | "rejected"
  | "superseded";
export type RunStatus = "unknown" | "passing" | "failing" | "skipped";
export type EvidenceStatus = "passing" | "failing" | "skipped";
export type SnapshotSource = "daemon" | "static" | "empty";
export type ReviewLogAction =
  | "accepted"
  | "changes_requested"
  | "deprecated"
  | "proposed"
  | "rejected"
  | "superseded";

export interface HarnessProject {
  name: LocalizedText;
  description: LocalizedText;
  packageCount: number;
  moduleCount: number;
  featureCount: number;
  ruleCount: number;
  exampleCount: number;
  warningCount: number;
  errorCount: number;
}

export interface HarnessPackage {
  id: string;
  title: LocalizedText;
  path: string;
  purpose: LocalizedText;
  moduleIds: string[];
}

export interface HarnessModule {
  id: string;
  package: string;
  title: LocalizedText;
  purpose: LocalizedText;
  covers: string[];
  featureTags: string[];
}

export interface HarnessFeature {
  tag: string;
  name: string;
  path: string;
  line: number;
  locale: string;
  package: string;
  module: string;
  rules: HarnessRule[];
}

export interface HarnessRule {
  tag: string;
  name: string;
  line: number;
  state: BehaviorState;
  owner: string;
  reviewEvents: HarnessReviewEvent[];
  examples: HarnessExample[];
}

export interface HarnessReviewEvent {
  id: string;
  at: string;
  by: string;
  action: ReviewLogAction;
  summary: LocalizedText;
  note?: LocalizedText;
}

export interface HarnessExample {
  tag: string;
  name: string;
  line: number;
  runStatus: RunStatus;
  evidence: HarnessExampleEvidence[];
}

export interface HarnessExampleEvidence {
  file: string;
  locale: string;
  status: EvidenceStatus;
  failureMessage?: string;
}

export interface ReviewDraft {
  id: string;
  title: LocalizedText;
  moduleIds: string[];
  state: BehaviorState;
  reason: LocalizedText;
}

export interface HarnessSnapshot {
  source?: SnapshotSource;
  project: HarnessProject;
  packages: HarnessPackage[];
  modules: HarnessModule[];
  features: HarnessFeature[];
  reviewDrafts: ReviewDraft[];
  resultsGeneratedAt?: string;
}

const behaviorStates = [
  "accepted",
  "changes_requested",
  "deprecated",
  "draft",
  "proposed",
  "rejected",
  "superseded",
] as const;
const runStatuses = ["unknown", "passing", "failing", "skipped"] as const;
const evidenceStatuses = ["passing", "failing", "skipped"] as const;
const snapshotSources = ["daemon", "static", "empty"] as const;
const reviewLogActions = [
  "accepted",
  "changes_requested",
  "deprecated",
  "proposed",
  "rejected",
  "superseded",
] as const;

export function isHarnessSnapshot(value: unknown): value is HarnessSnapshot {
  if (!isRecord(value)) return false;
  if (value.source !== undefined && !isOneOf(value.source, snapshotSources)) return false;

  return (
    isProject(value.project) &&
    isArrayOf(value.packages, isHarnessPackage) &&
    isArrayOf(value.modules, isHarnessModule) &&
    isArrayOf(value.features, isHarnessFeature) &&
    isArrayOf(value.reviewDrafts, isReviewDraft) &&
    optionalString(value.resultsGeneratedAt)
  );
}

function isProject(value: unknown): value is HarnessProject {
  return (
    isRecord(value) &&
    isLocalizedText(value.name) &&
    isLocalizedText(value.description) &&
    typeof value.packageCount === "number" &&
    typeof value.moduleCount === "number" &&
    typeof value.featureCount === "number" &&
    typeof value.ruleCount === "number" &&
    typeof value.exampleCount === "number" &&
    typeof value.warningCount === "number" &&
    typeof value.errorCount === "number"
  );
}

function isHarnessPackage(value: unknown): value is HarnessPackage {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    isLocalizedText(value.title) &&
    typeof value.path === "string" &&
    isLocalizedText(value.purpose) &&
    isArrayOf(value.moduleIds, isString)
  );
}

function isHarnessModule(value: unknown): value is HarnessModule {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.package === "string" &&
    isLocalizedText(value.title) &&
    isLocalizedText(value.purpose) &&
    isArrayOf(value.covers, isString) &&
    isArrayOf(value.featureTags, isString)
  );
}

function isHarnessFeature(value: unknown): value is HarnessFeature {
  return (
    isRecord(value) &&
    typeof value.tag === "string" &&
    typeof value.name === "string" &&
    typeof value.path === "string" &&
    typeof value.line === "number" &&
    typeof value.locale === "string" &&
    typeof value.package === "string" &&
    typeof value.module === "string" &&
    isArrayOf(value.rules, isHarnessRule)
  );
}

function isHarnessRule(value: unknown): value is HarnessRule {
  return (
    isRecord(value) &&
    typeof value.tag === "string" &&
    typeof value.name === "string" &&
    typeof value.line === "number" &&
    isOneOf(value.state, behaviorStates) &&
    typeof value.owner === "string" &&
    isArrayOf(value.reviewEvents, isHarnessReviewEvent) &&
    isArrayOf(value.examples, isHarnessExample)
  );
}

function isHarnessReviewEvent(value: unknown): value is HarnessReviewEvent {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.at === "string" &&
    typeof value.by === "string" &&
    isOneOf(value.action, reviewLogActions) &&
    isLocalizedText(value.summary) &&
    optionalLocalizedText(value.note)
  );
}

function isHarnessExample(value: unknown): value is HarnessExample {
  return (
    isRecord(value) &&
    typeof value.tag === "string" &&
    typeof value.name === "string" &&
    typeof value.line === "number" &&
    isOneOf(value.runStatus, runStatuses) &&
    isArrayOf(value.evidence, isHarnessExampleEvidence)
  );
}

function isHarnessExampleEvidence(value: unknown): value is HarnessExampleEvidence {
  return (
    isRecord(value) &&
    typeof value.file === "string" &&
    typeof value.locale === "string" &&
    isOneOf(value.status, evidenceStatuses) &&
    optionalString(value.failureMessage)
  );
}

function isReviewDraft(value: unknown): value is ReviewDraft {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    isLocalizedText(value.title) &&
    isArrayOf(value.moduleIds, isString) &&
    isOneOf(value.state, behaviorStates) &&
    isLocalizedText(value.reason)
  );
}

function isLocalizedText(value: unknown): value is LocalizedText {
  if (typeof value === "string") return true;
  if (!isRecord(value)) return false;

  const entries = Object.values(value);
  return (
    entries.some((entry) => typeof entry === "string") &&
    entries.every((entry) => entry === undefined || typeof entry === "string")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function optionalLocalizedText(value: unknown): boolean {
  return value === undefined || isLocalizedText(value);
}

function isArrayOf<T>(value: unknown, guard: (item: unknown) => item is T): value is T[] {
  return Array.isArray(value) && value.every(guard);
}

function isOneOf<const T extends readonly string[]>(
  value: unknown,
  options: T,
): value is T[number] {
  return typeof value === "string" && options.includes(value);
}
