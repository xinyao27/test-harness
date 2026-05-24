import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Effect } from "effect";
import { describe, expect } from "vite-plus/test";

import { harnessRootEnvVar, loadTestResults } from "../../core/src/index.ts";
import { scenarioTest } from "../src/index.ts";
import HarnessReporter, { collectTestResultsFromModules } from "../src/reporter.ts";

const withTempRoot = async () => {
  const root = await mkdtemp(join(tmpdir(), "harness-adapter-vitest-"));
  return {
    async cleanup() {
      await rm(root, { force: true, recursive: true });
    },
    root,
  };
};

describe("Vitest adapter", () => {
  scenarioTest(
    "harness.adapters.vitest.scenario_helper.binds_tests_to_canonical_promises",
    "binds this Vitest test to a canonical promise id",
    () => {
      expect(() => {
        scenarioTest("", "blank ids are rejected", () => undefined);
      }).toThrow("scenarioTest requires a non-blank promise id.");
    },
  );

  scenarioTest(
    "harness.adapters.vitest.result_collector.maps_results_to_promises",
    "maps Vitest task metadata to persisted result records",
    () => {
      const testCase = {
        fullName: "result collector > maps metadata",
        meta: () => ({
          promiseId: "harness.adapters.vitest.result_collector.maps_results_to_promises",
        }),
        module: { moduleId: "/workspace/packages/adapter-vitest/tests/index.test.ts" },
        name: "maps metadata",
        result: () => ({ state: "passed" }),
      };
      const results = collectTestResultsFromModules([
        {
          children: {
            allTests: () => [testCase],
          },
          moduleId: "/workspace/packages/adapter-vitest/tests/index.test.ts",
        },
      ]);

      expect(results).toEqual([
        {
          file: "/workspace/packages/adapter-vitest/tests/index.test.ts",
          promiseId: "harness.adapters.vitest.result_collector.maps_results_to_promises",
          status: "passing",
          testName: "result collector > maps metadata",
        },
      ]);
    },
  );

  scenarioTest(
    "harness.adapters.vitest.result_collector.writes_results_to_explicit_harness_root",
    "reporter writes results under the explicit Harness root env var",
    async () => {
      const workspace = await withTempRoot();
      const previousRoot = process.env[harnessRootEnvVar];
      process.env[harnessRootEnvVar] = workspace.root;

      try {
        const reporter = new HarnessReporter();
        const testCase = {
          fullName: "result collector > writes to root",
          meta: () => ({
            promiseId: "harness.adapters.vitest.result_collector.maps_results_to_promises",
          }),
          module: { moduleId: "/workspace/packages/adapter-vitest/tests/index.test.ts" },
          name: "writes to root",
          result: () => ({ state: "passed" }),
        };

        await reporter.onTestRunEnd([
          {
            children: {
              allTests: () => [testCase],
            },
            moduleId: "/workspace/packages/adapter-vitest/tests/index.test.ts",
          },
        ] as unknown as Parameters<HarnessReporter["onTestRunEnd"]>[0]);

        await expect(Effect.runPromise(loadTestResults(workspace.root))).resolves.toEqual([
          {
            file: "/workspace/packages/adapter-vitest/tests/index.test.ts",
            promiseId: "harness.adapters.vitest.result_collector.maps_results_to_promises",
            status: "passing",
            testName: "result collector > writes to root",
          },
        ]);
      } finally {
        if (previousRoot === undefined) {
          delete process.env[harnessRootEnvVar];
        } else {
          process.env[harnessRootEnvVar] = previousRoot;
        }
        await workspace.cleanup();
      }
    },
  );
});
