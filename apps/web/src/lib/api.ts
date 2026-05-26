import {
  getModuleById,
  getPromiseById,
  harnessSnapshot,
  type HarnessSnapshot,
} from "@/data/harness-snapshot";
import { todoBackendSnapshot } from "@/data/todo-backend-snapshot";

export async function getWorkbenchSnapshot() {
  return harnessSnapshot;
}

export async function getWorkbenchSnapshotForProject(projectId: string) {
  return getSnapshotByProjectId(projectId);
}

export async function getWorkbenchModule(moduleId: string) {
  return getModuleById(moduleId);
}

export async function getWorkbenchPromise(promiseId: string) {
  return getPromiseById(promiseId);
}

function getSnapshotByProjectId(projectId: string): HarnessSnapshot {
  if (projectId === "current:test-harness") return harnessSnapshot;
  if (projectId === "example:todo-backend") return todoBackendSnapshot;
  return createEmptyProjectSnapshot(projectId);
}

function createEmptyProjectSnapshot(projectId: string): HarnessSnapshot {
  const projectName =
    projectId === "none"
      ? "No project"
      : projectId.replace(/^directory:/, "") || "Selected project";

  return {
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
