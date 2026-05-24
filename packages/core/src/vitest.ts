import { test, type TestFunction, type TestOptions } from "vite-plus/test";

type ScenarioTestOptions = Omit<TestOptions, "meta"> & {
  readonly meta?: Record<string, unknown>;
};

export const scenarioTest = (
  promiseId: string,
  name: string,
  fn: TestFunction,
  options: ScenarioTestOptions = {},
): void => {
  if (promiseId.trim().length === 0) {
    throw new Error("scenarioTest requires a non-blank promise id.");
  }

  const { meta, ...rest } = options;
  const scenarioOptions: TestOptions = {
    ...rest,
    meta: {
      ...meta,
      promiseId,
    } as TestOptions["meta"],
  };

  test(name, scenarioOptions, fn);
};
