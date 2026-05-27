// oxlint-disable unicorn/no-thenable

import type { LocalizedText } from "@/lib/localized-text";

export type PromiseLifecycle =
  | "proposed"
  | "accepted"
  | "implemented"
  | "changed_requires_review"
  | "deprecated";

export type PromisePriority = "P0" | "P1" | "P2";
export type ModulePriority = PromisePriority | "none";
export type PromiseBoundary = "unit" | "integration" | "browser" | "e2e" | "adapter";
export type RunStatus = "unknown" | "passing" | "failing" | "skipped" | "missing_evidence";
export type EvidenceStatus = "passing" | "failing" | "skipped";
export type ReviewState = "pending" | "approved" | "rejected" | "changes_requested";
export type ReviewAction = "approved" | "rejected" | "changes_requested";

/** One bound test result that proves (or fails to prove) a promise. */
export interface PromiseEvidence {
  testName: string;
  file: string;
  status: EvidenceStatus;
  failureMessage?: string;
}

export interface HarnessModule {
  id: string;
  title: LocalizedText;
  summary: LocalizedText;
  purpose: LocalizedText;
  priority: ModulePriority;
  promiseIds: string[];
  covers: string[];
  relatedModuleIds: string[];
  /** Monorepo package (workspace member) this module belongs to; absent for single-package repos. */
  package?: string;
}

export interface HarnessPromise {
  id: string;
  moduleId: string;
  feature: string;
  title: LocalizedText;
  purpose: LocalizedText;
  priority: PromisePriority;
  boundary: PromiseBoundary;
  lifecycle: PromiseLifecycle;
  runStatus: RunStatus;
  given: LocalizedText[];
  when: LocalizedText[];
  then: LocalizedText[];
  observes: string[];
  /** Bound test results that prove this promise; empty when nothing has been run for it. */
  evidence: PromiseEvidence[];
  failureMeaning: LocalizedText;
  review: {
    state: ReviewState;
    decidedBy?: string;
    decidedAt?: string;
    note?: string;
    events: Array<{
      action: ReviewAction;
      at: string;
      by: string;
      note?: string;
    }>;
  };
}

export interface ReviewDraft {
  id: string;
  title: LocalizedText;
  moduleIds: string[];
  priority: PromisePriority;
  state: ReviewState;
  reason: LocalizedText;
}

export type SnapshotSource = "daemon" | "static" | "empty";

export interface HarnessSnapshot {
  source?: SnapshotSource;
  project: {
    name: LocalizedText;
    description: LocalizedText;
    promiseCount: number;
    moduleCount: number;
    warningCount: number;
    errorCount: number;
  };
  modules: HarnessModule[];
  promises: HarnessPromise[];
  reviewDrafts: ReviewDraft[];
  /** When the project's test results were last generated; absent if it has never run. */
  resultsGeneratedAt?: string;
}

const promisePriorities = ["P0", "P1", "P2"] as const;
const modulePriorities = ["P0", "P1", "P2", "none"] as const;
const promiseBoundaries = ["unit", "integration", "browser", "e2e", "adapter"] as const;
const promiseLifecycles = [
  "proposed",
  "accepted",
  "implemented",
  "changed_requires_review",
  "deprecated",
] as const;
const runStatuses = ["unknown", "passing", "failing", "skipped", "missing_evidence"] as const;
const evidenceStatuses = ["passing", "failing", "skipped"] as const;
const reviewStates = ["pending", "approved", "rejected", "changes_requested"] as const;
const reviewActions = ["approved", "rejected", "changes_requested"] as const;
const snapshotSources = ["daemon", "static", "empty"] as const;

export function isHarnessSnapshot(value: unknown): value is HarnessSnapshot {
  if (!isRecord(value)) return false;
  if (value.source !== undefined && !isOneOf(value.source, snapshotSources)) return false;

  return (
    isProject(value.project) &&
    isArrayOf(value.modules, isHarnessModule) &&
    isArrayOf(value.promises, isHarnessPromise) &&
    isArrayOf(value.reviewDrafts, isReviewDraft) &&
    optionalString(value.resultsGeneratedAt)
  );
}

function isProject(value: unknown): value is HarnessSnapshot["project"] {
  return (
    isRecord(value) &&
    isLocalizedText(value.name) &&
    isLocalizedText(value.description) &&
    typeof value.promiseCount === "number" &&
    typeof value.moduleCount === "number" &&
    typeof value.warningCount === "number" &&
    typeof value.errorCount === "number"
  );
}

function isHarnessModule(value: unknown): value is HarnessModule {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    isLocalizedText(value.title) &&
    isLocalizedText(value.summary) &&
    isLocalizedText(value.purpose) &&
    isOneOf(value.priority, modulePriorities) &&
    isArrayOf(value.promiseIds, isString) &&
    isArrayOf(value.covers, isString) &&
    isArrayOf(value.relatedModuleIds, isString) &&
    optionalString(value.package)
  );
}

function isHarnessPromise(value: unknown): value is HarnessPromise {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.moduleId === "string" &&
    typeof value.feature === "string" &&
    isLocalizedText(value.title) &&
    isLocalizedText(value.purpose) &&
    isOneOf(value.priority, promisePriorities) &&
    isOneOf(value.boundary, promiseBoundaries) &&
    isOneOf(value.lifecycle, promiseLifecycles) &&
    isOneOf(value.runStatus, runStatuses) &&
    isArrayOf(value.given, isLocalizedText) &&
    isArrayOf(value.when, isLocalizedText) &&
    isArrayOf(value.then, isLocalizedText) &&
    isArrayOf(value.observes, isString) &&
    isArrayOf(value.evidence, isPromiseEvidence) &&
    isLocalizedText(value.failureMeaning) &&
    isReview(value.review)
  );
}

function isPromiseEvidence(value: unknown): value is PromiseEvidence {
  return (
    isRecord(value) &&
    typeof value.testName === "string" &&
    typeof value.file === "string" &&
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
    isOneOf(value.priority, promisePriorities) &&
    isOneOf(value.state, reviewStates) &&
    isLocalizedText(value.reason)
  );
}

function isReview(value: unknown): value is HarnessPromise["review"] {
  return (
    isRecord(value) &&
    isOneOf(value.state, reviewStates) &&
    optionalString(value.decidedBy) &&
    optionalString(value.decidedAt) &&
    optionalString(value.note) &&
    isArrayOf(value.events, isReviewEvent)
  );
}

function isReviewEvent(value: unknown): value is HarnessPromise["review"]["events"][number] {
  return (
    isRecord(value) &&
    isOneOf(value.action, reviewActions) &&
    typeof value.by === "string" &&
    typeof value.at === "string" &&
    optionalString(value.note)
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

function isArrayOf<T>(value: unknown, guard: (item: unknown) => item is T): value is T[] {
  return Array.isArray(value) && value.every(guard);
}

function isOneOf<const T extends readonly string[]>(
  value: unknown,
  options: T,
): value is T[number] {
  return typeof value === "string" && options.includes(value);
}
