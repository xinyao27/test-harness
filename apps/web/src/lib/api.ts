import {
  isHarnessSnapshot,
  type HarnessPromise,
  type HarnessSnapshot,
  type SnapshotSource,
} from "@/data/harness-snapshot";
import type { LocalizedText } from "@/lib/localized-text";

export type WorkbenchProject = {
  id: string;
  name: string;
  path: string;
  source: "current" | "directory" | "example";
};

const daemonBaseUrl =
  (import.meta.env.VITE_HARNESS_DAEMON_URL as string | undefined) ?? "http://127.0.0.1:4101";
const daemonTokenStorageKey = "harness-studio.daemon-token";
const daemonSnapshotTimeoutMs = 700;
const daemonProjectsTimeoutMs = 700;
const daemonStatusTimeoutMs = 700;

export type DaemonConnectionState =
  | "connected"
  | "disconnected"
  | "invalid-session"
  | "pairing-required";

export type DaemonConnectionStatus = {
  state: DaemonConnectionState;
};

export type DaemonPairingStart = {
  expiresInSeconds: number;
};

export type WorkbenchRunResult = {
  exitCode: number;
  stderr: string;
  stdout: string;
};

export type WorkbenchWriteResult = {
  exitCode: number;
  saved: boolean;
  stderr: string;
  stdout: string;
};

export type WorkbenchOpenResult = {
  opened: boolean;
  path: string;
};

export type WorkbenchModuleRecord = {
  apiVersion: 1;
  covers: string[];
  id: string;
  promises: string[];
  purpose: LocalizedText;
  summary: LocalizedText;
  title: LocalizedText;
};

export type WorkbenchPromiseRecord = {
  boundary: HarnessPromise["boundary"];
  deprecatedBy?: string;
  examples?: Array<Record<string, string>>;
  failureMeaning: LocalizedText;
  feature: string;
  given: LocalizedText[];
  id: string;
  lifecycle: HarnessPromise["lifecycle"];
  observes: string[];
  priority: HarnessPromise["priority"];
  purpose: LocalizedText;
  review: HarnessPromise["review"];
  supersedes?: string[];
  then: LocalizedText[];
  title: LocalizedText;
  when: LocalizedText[];
};

export type WorkbenchReviewAction = "approved" | "changes_requested" | "rejected";

export type WorkbenchPromiseReviewRequest = {
  action: WorkbenchReviewAction;
  note?: string;
  promiseId: string;
  projectId: string;
  reviewer: string;
};

type DaemonPairingComplete = {
  token: string;
  expiresInSeconds: number;
};

export const fallbackWorkbenchProjects: WorkbenchProject[] = [
  {
    id: "current:test-harness",
    name: "test-harness",
    path: ".",
    source: "current",
  },
  {
    id: "example:todo-backend",
    name: "todo-backend",
    path: "examples/todo-backend",
    source: "example",
  },
];

export async function getWorkbenchSnapshot() {
  return getWorkbenchSnapshotForProject("current:test-harness");
}

export async function getWorkbenchProjects(): Promise<WorkbenchProject[]> {
  return (await getDaemonProjects()) ?? fallbackWorkbenchProjects;
}

export async function getDaemonConnectionStatus(): Promise<DaemonConnectionStatus> {
  const isDaemonReachable = await getDaemonHealth();
  if (!isDaemonReachable) return { state: "disconnected" };

  if (!readDaemonToken()) return { state: "pairing-required" };

  const projects = await getDaemonProjects();
  return { state: projects ? "connected" : "invalid-session" };
}

export async function startDaemonPairing(): Promise<DaemonPairingStart | null> {
  const body = await postDaemonJsonBody("/api/pairing/start");
  if (!isDaemonPairingStart(body)) return null;

  return body;
}

export async function completeDaemonPairing(pairingCode: string): Promise<boolean> {
  const body = await postDaemonJsonBody("/api/pairing/complete", { pairingCode });
  if (!isDaemonPairingComplete(body)) return false;

  writeDaemonToken(body.token);
  return true;
}

export async function revokeDaemonSession(): Promise<void> {
  try {
    await postDaemonJson("/api/session/revoke", undefined, { includeToken: true });
  } catch (error) {
    console.warn("Harness daemon session revoke failed", error);
  } finally {
    clearDaemonToken();
  }
}

export async function getWorkbenchSnapshotForProject(projectId: string) {
  return (await getDaemonSnapshot(projectId)) ?? createEmptyProjectSnapshot(projectId);
}

export async function runWorkbenchTests(projectId: string): Promise<WorkbenchRunResult | null> {
  const body = await postDaemonJsonBody("/api/run/tests", { projectId }, { includeToken: true });
  if (!isWorkbenchRunResult(body)) return null;

  return body;
}

// Ask the daemon to open a project-relative file in the local editor. Returns true only when the
// daemon confirms it opened a file inside the project root.
export async function openWorkbenchFile(projectId: string, file: string): Promise<boolean> {
  const body = await postDaemonJsonBody(
    "/api/studio/open",
    { file, projectId },
    { includeToken: true },
  );
  return isWorkbenchOpenResult(body) && body.opened;
}

export async function saveWorkbenchModule(
  projectId: string,
  module: WorkbenchModuleRecord,
): Promise<WorkbenchWriteResult | null> {
  const body = await postDaemonJsonBody(
    "/api/studio/module",
    { module, projectId },
    { includeToken: true },
  );
  if (!isWorkbenchWriteResult(body)) return null;

  return body;
}

export async function saveWorkbenchPromise(
  projectId: string,
  moduleId: string,
  promise: WorkbenchPromiseRecord,
): Promise<WorkbenchWriteResult | null> {
  const body = await postDaemonJsonBody(
    "/api/studio/promise",
    { moduleId, projectId, promise },
    { includeToken: true },
  );
  if (!isWorkbenchWriteResult(body)) return null;

  return body;
}

export async function saveWorkbenchPromiseReview(
  request: WorkbenchPromiseReviewRequest,
): Promise<WorkbenchWriteResult | null> {
  const body = await postDaemonJsonBody("/api/studio/promise-review", request, {
    includeToken: true,
  });
  if (!isWorkbenchWriteResult(body)) return null;

  return body;
}

export async function getWorkbenchModule(moduleId: string, projectId = "current:test-harness") {
  const snapshot = await getWorkbenchSnapshotForProject(projectId);
  return snapshot.modules.find((module) => module.id === moduleId);
}

export async function getWorkbenchPromise(promiseId: string, projectId = "current:test-harness") {
  const snapshot = await getWorkbenchSnapshotForProject(projectId);
  return snapshot.promises.find((promise) => promise.id === promiseId);
}

async function getDaemonSnapshot(projectId: string): Promise<HarnessSnapshot | null> {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof globalThis.setTimeout> | null = null;
  let urlText = daemonBaseUrl;

  try {
    const url = buildDaemonUrl("/api/snapshot");
    url.searchParams.set("projectId", projectId);
    urlText = url.toString();
    timeoutId = globalThis.setTimeout(() => controller.abort(), daemonSnapshotTimeoutMs);

    const response = await fetch(url, {
      headers: daemonHeaders({ includeToken: true }),
      signal: controller.signal,
    });
    if (!response.ok) {
      console.warn(`Harness daemon snapshot request failed: ${response.status} ${urlText}`);
      return null;
    }

    const snapshot: unknown = await response.json();
    if (!isHarnessSnapshot(snapshot)) {
      console.warn(
        `Harness daemon snapshot response did not match the Studio contract: ${urlText}`,
      );
      return null;
    }

    return withSnapshotSource(snapshot, "daemon");
  } catch (error) {
    console.warn(`Harness daemon snapshot is unavailable: ${urlText}`, error);
    return null;
  } finally {
    if (timeoutId) globalThis.clearTimeout(timeoutId);
  }
}

async function getDaemonProjects(): Promise<WorkbenchProject[] | null> {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof globalThis.setTimeout> | null = null;
  let urlText = daemonBaseUrl;

  try {
    const url = buildDaemonUrl("/api/projects");
    urlText = url.toString();
    timeoutId = globalThis.setTimeout(() => controller.abort(), daemonProjectsTimeoutMs);

    const response = await fetch(url, {
      headers: daemonHeaders({ includeToken: true }),
      signal: controller.signal,
    });
    if (!response.ok) {
      console.warn(`Harness daemon projects request failed: ${response.status} ${urlText}`);
      return null;
    }

    const projects: unknown = await response.json();
    if (!Array.isArray(projects) || !projects.every(isWorkbenchProject)) {
      console.warn(
        `Harness daemon projects response did not match the Studio contract: ${urlText}`,
      );
      return null;
    }

    return projects;
  } catch (error) {
    console.warn(
      `Harness daemon projects are unavailable; using fallback projects: ${urlText}`,
      error,
    );
    return null;
  } finally {
    if (timeoutId) globalThis.clearTimeout(timeoutId);
  }
}

function buildDaemonUrl(path: string): URL {
  return new URL(`${daemonBaseUrl.replace(/\/$/, "")}${path}`);
}

async function getDaemonHealth(): Promise<boolean> {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof globalThis.setTimeout> | null = null;

  try {
    timeoutId = globalThis.setTimeout(() => controller.abort(), daemonStatusTimeoutMs);
    const response = await fetch(buildDaemonUrl("/health"), {
      headers: daemonHeaders(),
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    if (timeoutId) globalThis.clearTimeout(timeoutId);
  }
}

async function postDaemonJson(
  path: string,
  body?: unknown,
  options: { includeToken?: boolean } = {},
): Promise<Response> {
  return fetch(buildDaemonUrl(path), {
    method: "POST",
    headers: daemonHeaders({
      contentType: body === undefined ? undefined : "application/json",
      includeToken: options.includeToken,
    }),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

// POST to the daemon and parse the JSON body, returning null on any transport failure, non-OK
// status, or invalid JSON — so callers never throw (which would leave UI write-state stuck).
async function postDaemonJsonBody(
  path: string,
  body?: unknown,
  options: { includeToken?: boolean } = {},
): Promise<unknown> {
  try {
    const response = await postDaemonJson(path, body, options);
    if (!response.ok) {
      console.warn(`Harness daemon request failed: ${response.status} ${path}`);
      return null;
    }
    return await response.json();
  } catch (error) {
    console.warn(`Harness daemon request is unavailable: ${path}`, error);
    return null;
  }
}

function daemonHeaders(options: { contentType?: string; includeToken?: boolean } = {}) {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.contentType) headers["Content-Type"] = options.contentType;

  const token = options.includeToken ? readDaemonToken() : null;
  if (token) headers.Authorization = `Bearer ${token}`;

  return headers;
}

function readDaemonToken() {
  if (typeof window === "undefined") return null;

  return window.localStorage.getItem(daemonTokenStorageKey);
}

function writeDaemonToken(token: string) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(daemonTokenStorageKey, token);
}

function clearDaemonToken() {
  if (typeof window === "undefined") return;

  window.localStorage.removeItem(daemonTokenStorageKey);
}

function withSnapshotSource(snapshot: HarnessSnapshot, source: SnapshotSource): HarnessSnapshot {
  return {
    ...snapshot,
    source,
  };
}

function createEmptyProjectSnapshot(projectId: string): HarnessSnapshot {
  const projectName =
    projectId === "none"
      ? "No project"
      : projectId.replace(/^directory:/, "") || "Selected project";

  return {
    source: "empty",
    project: {
      name: {
        "zh-CN": projectName,
        en: projectName,
      },
      description: {
        "zh-CN":
          "这个 project 还没有可显示的 Harness snapshot。需要 daemon 读取它的 tests/ 目录后才能展示真实模块。",
        en: "This project does not have a displayable Harness snapshot yet. The daemon must read its tests/ directory before real modules can appear.",
      },
      promiseCount: 0,
      moduleCount: 0,
      warningCount: 0,
      errorCount: 0,
    },
    modules: [],
    promises: [],
    reviewDrafts: [],
  };
}

function isWorkbenchProject(value: unknown): value is WorkbenchProject {
  if (!value || typeof value !== "object") return false;

  const project = value as Record<string, unknown>;
  return (
    typeof project.id === "string" &&
    typeof project.name === "string" &&
    typeof project.path === "string" &&
    (project.source === "current" || project.source === "directory" || project.source === "example")
  );
}

function isDaemonPairingStart(value: unknown): value is DaemonPairingStart {
  if (!value || typeof value !== "object") return false;

  const body = value as Record<string, unknown>;
  return typeof body.expiresInSeconds === "number";
}

function isDaemonPairingComplete(value: unknown): value is DaemonPairingComplete {
  if (!value || typeof value !== "object") return false;

  const body = value as Record<string, unknown>;
  return typeof body.token === "string" && typeof body.expiresInSeconds === "number";
}

function isWorkbenchRunResult(value: unknown): value is WorkbenchRunResult {
  if (!value || typeof value !== "object") return false;

  const body = value as Record<string, unknown>;
  return (
    typeof body.exitCode === "number" &&
    typeof body.stderr === "string" &&
    typeof body.stdout === "string"
  );
}

function isWorkbenchOpenResult(value: unknown): value is WorkbenchOpenResult {
  if (!value || typeof value !== "object") return false;

  const body = value as Record<string, unknown>;
  return typeof body.opened === "boolean" && typeof body.path === "string";
}

function isWorkbenchWriteResult(value: unknown): value is WorkbenchWriteResult {
  if (!value || typeof value !== "object") return false;

  const body = value as Record<string, unknown>;
  return (
    typeof body.exitCode === "number" &&
    typeof body.saved === "boolean" &&
    typeof body.stderr === "string" &&
    typeof body.stdout === "string"
  );
}
