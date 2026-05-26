import {
  harnessSnapshot,
  isHarnessSnapshot,
  type HarnessSnapshot,
  type SnapshotSource,
} from "@/data/harness-snapshot";
import { todoBackendSnapshot } from "@/data/todo-backend-snapshot";

const daemonBaseUrl =
  (import.meta.env.VITE_HARNESS_DAEMON_URL as string | undefined) ?? "http://127.0.0.1:4101";
const daemonSnapshotTimeoutMs = 700;

export async function getWorkbenchSnapshot() {
  return getWorkbenchSnapshotForProject("current:test-harness");
}

export async function getWorkbenchSnapshotForProject(projectId: string) {
  return (await getDaemonSnapshot(projectId)) ?? getSnapshotByProjectId(projectId);
}

export async function getWorkbenchModule(moduleId: string, projectId = "current:test-harness") {
  const snapshot = await getWorkbenchSnapshotForProject(projectId);
  return snapshot.modules.find((module) => module.id === moduleId);
}

export async function getWorkbenchPromise(promiseId: string, projectId = "current:test-harness") {
  const snapshot = await getWorkbenchSnapshotForProject(projectId);
  return snapshot.promises.find((promise) => promise.id === promiseId);
}

function getSnapshotByProjectId(projectId: string): HarnessSnapshot {
  if (projectId === "current:test-harness") return withSnapshotSource(harnessSnapshot, "static");
  if (projectId === "example:todo-backend")
    return withSnapshotSource(todoBackendSnapshot, "static");
  return createEmptyProjectSnapshot(projectId);
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
      headers: { Accept: "application/json" },
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
    console.warn(
      `Harness daemon is unavailable; using the static snapshot fallback: ${urlText}`,
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
