import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Effect } from "effect";
import { describe, expect } from "vite-plus/test";

import { scenarioTest } from "../../../packages/adapter-vitest/src/index.ts";
import { createTestResultsFile, writeTestResultsFile } from "../../../packages/core/src/index.ts";
import { validPromiseYaml } from "../../../tests/fixtures/promise-fixtures.ts";
import { runCli } from "../src/index.ts";

type RunCliOptions = NonNullable<Parameters<typeof runCli>[1]>;

const rootDir = process.cwd();

const readGoldenOutput = (name: string): Promise<string> =>
  readFile(join(rootDir, "protocol", "fixtures", "cli", "golden", name), "utf8").then((content) =>
    content.trimEnd(),
  );

const withTempWorkspace = async (content: string) => {
  const root = await mkdtemp(join(tmpdir(), "seed-harness-cli-"));
  await mkdir(join(root, "promises", "promise-registry"), { recursive: true });
  await writeFile(
    join(root, "promises", "promise-registry", "promise-registry.promises.yaml"),
    content,
  );
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
  scenarioTest(
    "harness.cli.check_validates_promises",
    "check succeeds for valid YAML promises",
    async () => {
      const workspace = await withTempWorkspace(validPromiseYaml);

      try {
        const result = await run(["check"], workspace.root);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("Seed Harness Check");
        expect(result.stdout).toContain("Errors: 0");
      } finally {
        await workspace.cleanup();
      }
    },
  );

  scenarioTest(
    "harness.cli.check_validates_promises",
    "check fails for invalid YAML promises",
    async () => {
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
    },
  );

  scenarioTest(
    "harness.cli.report_renders_promise_status",
    "verify renders a readable report",
    async () => {
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
    },
  );

  scenarioTest(
    "harness.protocol.cli_golden_outputs_lock_human_surface",
    "verify matches the portable full-report golden output",
    async () => {
      const workspace = await withTempWorkspace(validPromiseYaml);

      try {
        const result = await run(["verify"], workspace.root);
        expect(result.exitCode).toBe(0);
        await expect(readGoldenOutput("verify-basic.en.stdout")).resolves.toBe(result.stdout);
      } finally {
        await workspace.cleanup();
      }
    },
  );

  scenarioTest(
    "harness.cli.report_renders_promise_status",
    "verify renders run status from YAML results",
    async () => {
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
    },
  );

  scenarioTest(
    "harness.cli.report_renders_promise_status",
    "report renders the same readable promise status",
    async () => {
      const workspace = await withTempWorkspace(validPromiseYaml);

      try {
        const result = await run(["report"], workspace.root);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("Seed Harness Report");
        expect(result.stdout).toContain(
          "Promise ID: harness.promise_registry.load_canonical_yaml_promises",
        );
      } finally {
        await workspace.cleanup();
      }
    },
  );

  scenarioTest(
    "harness.cli.test_orchestrates_adapter_and_verify",
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
    "harness.cli.test_orchestrates_adapter_and_verify",
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
    "harness.cli.test_orchestrates_adapter_and_verify",
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
    "harness.cli.test_orchestrates_adapter_and_verify",
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
    "harness.cli.test_orchestrates_adapter_and_verify",
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
apiVersion: 1
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

  scenarioTest(
    "harness.report.renders_in_requested_language",
    "verify renders the requested report language",
    async () => {
      const workspace = await withTempWorkspace(validPromiseYaml);

      try {
        const result = await run(["verify", "--lang", "zh-CN"], workspace.root);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("已接受的承诺会从 canonical YAML 文件中加载");
        expect(result.stdout).toContain("该 promise 会被解码成 PromiseRecord");
      } finally {
        await workspace.cleanup();
      }
    },
  );

  scenarioTest(
    "harness.report.renders_in_requested_language",
    "verify renders the requested report language with equals syntax",
    async () => {
      const workspace = await withTempWorkspace(validPromiseYaml);

      try {
        const result = await run(["verify", "--lang=zh-CN"], workspace.root);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("已接受的承诺会从 canonical YAML 文件中加载");
      } finally {
        await workspace.cleanup();
      }
    },
  );

  scenarioTest(
    "harness.cli.report_summary_lists_promises_compactly",
    "summary header reports promise, error, and warning counts",
    async () => {
      const workspace = await withTempWorkspace(validPromiseYaml);

      try {
        const result = await run(["report", "--summary"], workspace.root);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain(
          "Seed Harness Report  ·  1 promises  ·  0 errors  ·  0 warnings",
        );
      } finally {
        await workspace.cleanup();
      }
    },
  );

  scenarioTest(
    "harness.protocol.cli_golden_outputs_lock_human_surface",
    "summary matches the portable compact-report golden output",
    async () => {
      const workspace = await withTempWorkspace(validPromiseYaml);

      try {
        const result = await run(["report", "--summary"], workspace.root);
        expect(result.exitCode).toBe(0);
        await expect(readGoldenOutput("report-summary-basic.en.stdout")).resolves.toBe(
          result.stdout,
        );
      } finally {
        await workspace.cleanup();
      }
    },
  );

  scenarioTest(
    "harness.cli.report_summary_lists_promises_compactly",
    "summary groups promises by feature in alphabetical order",
    async () => {
      const workspace = await withTempWorkspace(validPromiseYaml);
      const secondPromise = validPromiseYaml
        .replace(
          "id: harness.promise_registry.load_canonical_yaml_promises",
          "id: harness.adapters.vitest.placeholder",
        )
        .replace("feature: Seed Harness / Promise Registry", "feature: Adapters / Vitest");
      await writeFile(
        join(workspace.root, "promises", "promise-registry", "second.promises.yaml"),
        secondPromise,
      );

      try {
        const result = await run(["report", "--summary"], workspace.root);
        expect(result.exitCode).toBe(0);
        const adaptersIndex = result.stdout.indexOf("Adapters / Vitest");
        const seedIndex = result.stdout.indexOf("Seed Harness / Promise Registry");
        expect(adaptersIndex).toBeGreaterThanOrEqual(0);
        expect(seedIndex).toBeGreaterThan(adaptersIndex);
      } finally {
        await workspace.cleanup();
      }
    },
  );

  scenarioTest(
    "harness.cli.report_summary_lists_promises_compactly",
    "summary lists each promise on a single line with priority, lifecycle, run status, and title",
    async () => {
      const workspace = await withTempWorkspace(validPromiseYaml);

      try {
        await writeTestResultsFile(
          workspace.root,
          createTestResultsFile([
            {
              file: "packages/core/tests/index.test.ts",
              promiseId: "harness.promise_registry.load_canonical_yaml_promises",
              status: "passing",
              testName: "loads canonical YAML promises",
            },
          ]),
        );

        const result = await run(["report", "--summary"], workspace.root);
        expect(result.exitCode).toBe(0);
        const promiseLines = result.stdout
          .split("\n")
          .filter((line) => line.trim().startsWith("P0"));
        expect(promiseLines).toHaveLength(1);
        const [line] = promiseLines;
        expect(line).toContain("P0");
        expect(line).toContain("accepted");
        expect(line).toContain("passing");
        expect(line).toContain("Accepted promises are loaded from canonical YAML files");
      } finally {
        await workspace.cleanup();
      }
    },
  );

  scenarioTest(
    "harness.cli.report_summary_lists_promises_compactly",
    "summary does not expand given, when, then, evidence, purpose, or failure meaning",
    async () => {
      const workspace = await withTempWorkspace(validPromiseYaml);

      try {
        const result = await run(["report", "--summary"], workspace.root);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).not.toContain("Given:");
        expect(result.stdout).not.toContain("When:");
        expect(result.stdout).not.toContain("Then:");
        expect(result.stdout).not.toContain("Evidence:");
        expect(result.stdout).not.toContain("Purpose:");
        expect(result.stdout).not.toContain("Failure meaning:");
        expect(result.stdout).not.toContain("Promise ID:");
      } finally {
        await workspace.cleanup();
      }
    },
  );

  scenarioTest(
    "harness.cli.rejects_invalid_arguments_with_usage_hint",
    "fails when --lang is missing a language value",
    async () => {
      const workspace = await withTempWorkspace(validPromiseYaml);

      try {
        const result = await run(["verify", "--lang"], workspace.root);
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain("--lang requires a language value.");
        expect(result.stderr).toContain("Usage: harness");
      } finally {
        await workspace.cleanup();
      }
    },
  );
});
