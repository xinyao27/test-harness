import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Effect } from "effect";
import { describe, expect, test } from "vite-plus/test";

import { createTestResultsFile, writeTestResultsFile } from "../../../packages/core/src/index.ts";
import { scenarioTest } from "../../../packages/core/src/vitest.ts";
import { validPromiseYaml } from "../../../tests/fixtures/promise-fixtures.ts";
import { runCli } from "../src/index.ts";

type RunCliOptions = NonNullable<Parameters<typeof runCli>[1]>;

const withTempWorkspace = async (content: string) => {
  const root = await mkdtemp(join(tmpdir(), "seed-harness-cli-"));
  await mkdir(join(root, "promises", "test-harness"), { recursive: true });
  await writeFile(join(root, "promises", "test-harness", "promise-registry.promise.yaml"), content);
  return {
    async cleanup() {
      await rm(root, { force: true, recursive: true });
    },
    root,
  };
};

const run = async (
  args: readonly string[],
  cwd: string,
  options: Pick<RunCliOptions, "testRunner"> = {},
) => {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const exitCode = await Effect.runPromise(
    runCli(args, {
      cwd,
      streams: {
        stderr: (message) => stderr.push(message),
        stdout: (message) => stdout.push(message),
      },
      testRunner: options.testRunner,
    }),
  );
  return { exitCode, stderr: stderr.join("\n"), stdout: stdout.join("\n") };
};

describe("harness CLI", () => {
  test("check succeeds for valid YAML promises", async () => {
    const workspace = await withTempWorkspace(validPromiseYaml);

    try {
      const result = await run(["check"], workspace.root);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Seed Harness Check");
      expect(result.stdout).toContain("Errors: 0");
    } finally {
      await workspace.cleanup();
    }
  });

  test("check fails for invalid YAML promises", async () => {
    const workspace = await withTempWorkspace(
      validPromiseYaml.replace("lifecycle: accepted", "lifecycle: done"),
    );

    try {
      const result = await run(["check"], workspace.root);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("PromiseRecordLoadErrors");
      expect(result.stderr).toContain("PromiseSchemaDecodeError");
    } finally {
      await workspace.cleanup();
    }
  });

  test("verify renders a readable report", async () => {
    const workspace = await withTempWorkspace(validPromiseYaml);

    try {
      const result = await run(["verify"], workspace.root);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Seed Harness Report");
      expect(result.stdout).toContain("Feature: Seed Harness / Promise Registry");
      expect(result.stdout).toContain("Run Status: unknown");
    } finally {
      await workspace.cleanup();
    }
  });

  test("verify renders run status from YAML results", async () => {
    const workspace = await withTempWorkspace(validPromiseYaml);

    try {
      await writeTestResultsFile(
        workspace.root,
        createTestResultsFile([
          {
            file: "packages/core/tests/index.test.ts",
            promiseId: "harness.promise_registry.load_canonical_yaml_promises",
            status: "passing",
            testName: "loads canonical YAML promises with Effect Schema",
          },
        ]),
      );

      const result = await run(["verify"], workspace.root);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Run Status: passing");
    } finally {
      await workspace.cleanup();
    }
  });

  scenarioTest(
    "harness.cli.test_orchestrates_vitest_and_verify",
    "test runs the configured runner and renders the verification report",
    async () => {
      const workspace = await withTempWorkspace(validPromiseYaml);
      const calls: string[] = [];

      try {
        const result = await run(["test"], workspace.root, {
          testRunner: async ({ cwd }) => {
            calls.push(cwd);
            await writeTestResultsFile(
              cwd,
              createTestResultsFile([
                {
                  file: "apps/cli/tests/index.test.ts",
                  promiseId: "harness.promise_registry.load_canonical_yaml_promises",
                  status: "passing",
                  testName: "test runs the configured runner",
                },
              ]),
            );
            return 0;
          },
        });

        expect(calls).toEqual([workspace.root]);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("Seed Harness Report");
        expect(result.stdout).toContain("Run Status: passing");
      } finally {
        await workspace.cleanup();
      }
    },
  );

  scenarioTest(
    "harness.cli.test_orchestrates_vitest_and_verify",
    "test returns non-zero when the configured runner fails without results",
    async () => {
      const workspace = await withTempWorkspace(validPromiseYaml);

      try {
        const result = await run(["test"], workspace.root, {
          testRunner: async () => 1,
        });

        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain("Test command failed with exit code 1.");
        expect(result.stderr).not.toContain("No Harness result file found");
        expect(result.stdout).not.toContain("Seed Harness Report");
      } finally {
        await workspace.cleanup();
      }
    },
  );

  scenarioTest(
    "harness.cli.test_orchestrates_vitest_and_verify",
    "test renders failing results when the configured runner fails with results",
    async () => {
      const workspace = await withTempWorkspace(validPromiseYaml);

      try {
        const result = await run(["test"], workspace.root, {
          testRunner: async ({ cwd }) => {
            await writeTestResultsFile(
              cwd,
              createTestResultsFile([
                {
                  file: "apps/cli/tests/index.test.ts",
                  promiseId: "harness.promise_registry.load_canonical_yaml_promises",
                  status: "failing",
                  testName: "failing test",
                },
              ]),
            );
            return 1;
          },
        });

        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain("Test command failed with exit code 1.");
        expect(result.stdout).toContain("Seed Harness Report");
        expect(result.stdout).toContain("Run Status: failing");
      } finally {
        await workspace.cleanup();
      }
    },
  );

  scenarioTest(
    "harness.cli.test_orchestrates_vitest_and_verify",
    "test returns non-zero when the runner does not write results",
    async () => {
      const workspace = await withTempWorkspace(validPromiseYaml);

      try {
        const result = await run(["test"], workspace.root, {
          testRunner: async () => 0,
        });

        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain(
          "No Harness result file found at .harness/results.yaml after the test command.",
        );
        expect(result.stdout).toContain("Run Status: unknown");
      } finally {
        await workspace.cleanup();
      }
    },
  );

  scenarioTest(
    "harness.cli.test_orchestrates_vitest_and_verify",
    "test returns non-zero when result YAML is invalid",
    async () => {
      const workspace = await withTempWorkspace(validPromiseYaml);

      try {
        const result = await run(["test"], workspace.root, {
          testRunner: async ({ cwd }) => {
            await mkdir(join(cwd, ".harness"), { recursive: true });
            await writeFile(
              join(cwd, ".harness", "results.yaml"),
              `
generatedAt: "2026-05-24T00:00:00.000Z"
results:
  - file: apps/cli/tests/index.test.ts
    promiseId: harness.promise_registry.load_canonical_yaml_promises
    status: done
    testName: invalid result
`,
            );
            return 0;
          },
        });

        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain("TestResultsSchemaDecodeError");
      } finally {
        await workspace.cleanup();
      }
    },
  );

  test("verify renders the requested report language", async () => {
    const workspace = await withTempWorkspace(validPromiseYaml);

    try {
      const result = await run(["verify", "--lang", "zh-CN"], workspace.root);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("已接受的承诺会从 canonical YAML 文件中加载");
      expect(result.stdout).toContain("该 promise 会被解码成 PromiseRecord");
    } finally {
      await workspace.cleanup();
    }
  });

  test("verify renders the requested report language with equals syntax", async () => {
    const workspace = await withTempWorkspace(validPromiseYaml);

    try {
      const result = await run(["verify", "--lang=zh-CN"], workspace.root);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("已接受的承诺会从 canonical YAML 文件中加载");
    } finally {
      await workspace.cleanup();
    }
  });

  test("fails when --lang is missing a language value", async () => {
    const workspace = await withTempWorkspace(validPromiseYaml);

    try {
      const result = await run(["verify", "--lang"], workspace.root);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("--lang requires a language value.");
      expect(result.stderr).toContain("Usage: harness");
    } finally {
      await workspace.cleanup();
    }
  });
});
