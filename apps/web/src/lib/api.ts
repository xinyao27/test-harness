import {
  isHarnessSnapshot,
  type HarnessSnapshot,
  type SnapshotSource,
} from "@/data/harness-snapshot";

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

export type WorkbenchOpenResult = {
  opened: boolean;
  path: string;
};

export type RuleReviewAction = "accept" | "requestChanges" | "reject" | "deprecate" | "supersede";

export type RuleReviewResult = {
  eventId: string;
  feature: string;
  rule: string;
  state: string;
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

export async function reviewWorkbenchRule(input: {
  action: RuleReviewAction;
  feature: string;
  note?: string;
  projectId: string;
  rule: string;
}): Promise<RuleReviewResult | null> {
  const body = await postDaemonJsonBody(
    "/api/studio/review-rule",
    {
      action: input.action,
      feature: input.feature,
      note: input.note,
      projectId: input.projectId,
      reviewer: "studio",
      rule: input.rule,
    },
    { includeToken: true },
  );
  if (!isRuleReviewResult(body)) return null;

  return body;
}

export async function openWorkbenchFile(projectId: string, file: string): Promise<boolean> {
  const body = await postDaemonJsonBody(
    "/api/studio/open",
    { file, projectId },
    { includeToken: true },
  );
  return isWorkbenchOpenResult(body) && body.opened;
}

export type PtyKind = "terminal" | "agent";
export type AgentTool = "claude" | "codex" | "cursor";

export function getAgentPtyWebSocketUrl(
  kind: PtyKind = "agent",
  tool: AgentTool = "claude",
): string | null {
  const token = readDaemonToken();
  if (!token) return null;
  const url = buildDaemonUrl("/api/agent/pty");
  url.searchParams.set("token", token);
  url.searchParams.set("kind", kind);
  if (kind === "agent") {
    url.searchParams.set("agent", tool);
  }
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

export async function getWorkbenchModule(moduleId: string, projectId = "current:test-harness") {
  const snapshot = await getWorkbenchSnapshotForProject(projectId);
  return snapshot.modules.find((module) => module.id === moduleId);
}

export async function getWorkbenchFeature(featureTag: string, projectId = "current:test-harness") {
  const snapshot = await getWorkbenchSnapshotForProject(projectId);
  return snapshot.features.find((feature) => feature.tag === featureTag);
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
          "这个 project 还没有可显示的 Harness snapshot。需要 daemon 读取它的 tests/ 目录后才能展示真实行为。",
        en: "This project does not have a displayable Harness snapshot yet. The daemon must read its tests/ directory before behavior can appear.",
      },
      packageCount: 0,
      moduleCount: 0,
      featureCount: 0,
      ruleCount: 0,
      exampleCount: 0,
      warningCount: 0,
      errorCount: 0,
    },
    packages: [],
    modules: [],
    features: [],
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

function isRuleReviewResult(value: unknown): value is RuleReviewResult {
  if (!value || typeof value !== "object") return false;

  const body = value as Record<string, unknown>;
  return (
    typeof body.eventId === "string" &&
    typeof body.feature === "string" &&
    typeof body.rule === "string" &&
    typeof body.state === "string"
  );
}

function isWorkbenchOpenResult(value: unknown): value is WorkbenchOpenResult {
  if (!value || typeof value !== "object") return false;

  const body = value as Record<string, unknown>;
  return typeof body.opened === "boolean" && typeof body.path === "string";
}
