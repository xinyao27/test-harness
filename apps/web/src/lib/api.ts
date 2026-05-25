import { getModuleById, getPromiseById, harnessSnapshot } from "@/data/harness-snapshot";

export async function getWorkbenchSnapshot() {
  return harnessSnapshot;
}

export async function getWorkbenchModule(moduleId: string) {
  return getModuleById(moduleId);
}

export async function getWorkbenchPromise(promiseId: string) {
  return getPromiseById(promiseId);
}
