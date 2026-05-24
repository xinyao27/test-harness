import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Effect } from "effect";
import { describe, expect, test } from "vite-plus/test";

import { validPromiseYaml } from "../../../tests/fixtures/promise-fixtures.ts";
import { runCli } from "../src/index.ts";

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

const run = async (args: readonly string[], cwd: string) => {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const exitCode = await Effect.runPromise(
    runCli(args, {
      cwd,
      streams: {
        stderr: (message) => stderr.push(message),
        stdout: (message) => stdout.push(message),
      },
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
