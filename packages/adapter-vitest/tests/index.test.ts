import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect } from "vitest";

import { scenarioTest } from "../src/index.ts";
import HarnessReporter, {
  collectTestResultsFromModules,
  createAdapterEvents,
  harnessAdapterEventsDirEnvVar,
  harnessRootEnvVar,
  harnessRunIdEnvVar,
  resolveAdapterEventsDir,
  type AdapterEvent,
} from "../src/reporter.ts";

const withTempRoot = async () => {
  const root = await mkdtemp(join(tmpdir(), "harness-adapter-vitest-"));
  return {
    async cleanup() {
      await rm(root, { force: true, recursive: true });
    },
    root,
  };
};

const readEvents = async (directory: string): Promise<readonly AdapterEvent[]> => {
  const files = (await readdir(directory)).filter((file) => file.endsWith(".ndjson")).sort();
  const events: AdapterEvent[] = [];
  for (const file of files) {
    const raw = await readFile(join(directory, file), "utf8");
    for (const line of raw.split("\n").filter((line) => line.trim().length > 0)) {
      events.push(JSON.parse(line) as AdapterEvent);
    }
  }
  return events;
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
    "maps Vitest task metadata to portable adapter events",
    () => {
      const testCase = {
        fullName: "result collector > maps metadata",
        meta: () => ({
          implementation: "fixture-implementation",
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

      expect(
        createAdapterEvents(results, {
          runId: "vitest-fixture-run",
          timestamp: "2026-05-25T00:00:00.000Z",
        }),
      ).toEqual([
        {
          adapter: {
            framework: "vitest",
            name: "harness-adapter-vitest",
            version: "0.0.0",
          },
          apiVersion: 1,
          kind: "testResult",
          payload: {
            file: "/workspace/packages/adapter-vitest/tests/index.test.ts",
            labels: {
              implementation: "fixture-implementation",
            },
            promiseId: "harness.adapters.vitest.result_collector.maps_results_to_promises",
            status: "passing",
            testName: "result collector > maps metadata",
          },
          runId: "vitest-fixture-run",
          timestamp: "2026-05-25T00:00:00.000Z",
        },
      ]);
    },
  );

  scenarioTest(
    "harness.adapters.vitest.result_collector.writes_results_to_explicit_harness_root",
    "reporter writes events under the explicit Harness root env var",
    async () => {
      const workspace = await withTempRoot();
      const previousRoot = process.env[harnessRootEnvVar];
      const previousRunId = process.env[harnessRunIdEnvVar];
      const previousEventsDir = process.env[harnessAdapterEventsDirEnvVar];
      process.env[harnessRootEnvVar] = workspace.root;
      process.env[harnessRunIdEnvVar] = "vitest-explicit-root";
      delete process.env[harnessAdapterEventsDirEnvVar];

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

        const events = await readEvents(
          resolveAdapterEventsDir(workspace.root, "vitest-explicit-root"),
        );
        expect(events).toHaveLength(1);
        expect(events[0]?.runId).toBe("vitest-explicit-root");
        expect(events[0]?.payload).toEqual({
          file: "/workspace/packages/adapter-vitest/tests/index.test.ts",
          promiseId: "harness.adapters.vitest.result_collector.maps_results_to_promises",
          status: "passing",
          testName: "result collector > writes to root",
        });
      } finally {
        if (previousRoot === undefined) {
          delete process.env[harnessRootEnvVar];
        } else {
          process.env[harnessRootEnvVar] = previousRoot;
        }
        if (previousRunId === undefined) {
          delete process.env[harnessRunIdEnvVar];
        } else {
          process.env[harnessRunIdEnvVar] = previousRunId;
        }
        if (previousEventsDir === undefined) {
          delete process.env[harnessAdapterEventsDirEnvVar];
        } else {
          process.env[harnessAdapterEventsDirEnvVar] = previousEventsDir;
        }
        await workspace.cleanup();
      }
    },
  );
});
