import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { scenarioTest } from "@test-harness/adapter-vitest";
import { describe, expect } from "vitest";
import { parse } from "yaml";

import {
  exampleRoot,
  implementationIdForEvent,
  loadImplementationCatalog,
  loadOfficialSpecPromiseIds,
  matrixPath,
  readAdapterEvents,
  readResultsFile,
  repoRoot,
  resultsPath,
} from "../../tools/lib/evidence.mjs";

const isRequiredRun = process.env.TODO_SHOWCASE_TESTS_REQUIRED === "1";
const describeShowcase = isRequiredRun ? describe : describe.skip;

const runCommand = (command, args) =>
  execFileSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      HARNESS_ROOT_DIR: exampleRoot,
    },
  });

const runPnpmScript = (script, args = []) => runCommand("pnpm", [script, ...args]);

const runHarnessCli = (args) =>
  runCommand("node", ["examples/todo-backend/tools/run-harness-cli.mjs", ...args]);

const loadYaml = async (filePath) => parse(await readFile(filePath, "utf8"));

const expectPassingResult = (resultsFile, promiseId) => {
  expect(
    resultsFile.results.some(
      (result) => result.promiseId === promiseId && result.status === "passing",
    ),
  ).toBe(true);
};

const matrixRowsById = (matrix) => new Map(matrix.promises.map((promise) => [promise.id, promise]));

const expectMatrixStatus = (matrix, promiseId, implementationId, status) => {
  const row = matrixRowsById(matrix).get(promiseId);
  expect(row, `${promiseId} should be present in the matrix`).toBeTruthy();
  expect(row.implementations[implementationId].status).toBe(status);
};

describeShowcase("Todo-Backend Harness showcase", () => {
  scenarioTest(
    "todo_backend.spec.official_spec_map_is_complete",
    "official Todo-Backend spec map covers every source case with reviewed promises",
    async () => {
      const output = runPnpmScript("example:todo-spec-map:check");
      expect(output).toContain("16 official cases");

      const specMap = await loadYaml(path.join(exampleRoot, "spec-map.yaml"));
      expect(specMap.apiVersion).toBe(1);
      expect(specMap.coverage.expectedCaseCount).toBe(16);
      expect(specMap.cases).toHaveLength(16);
      expect(specMap.cases.every((specCase) => specCase.promiseIds.length > 0)).toBe(true);
    },
  );

  scenarioTest(
    "todo_backend.showcase.feature_map_covers_harness_capabilities",
    "feature map links every canonical Harness module to Todo-Backend artifacts",
    async () => {
      const featureMap = await loadYaml(path.join(exampleRoot, "harness-feature-map.yaml"));
      const output = runPnpmScript("example:todo-feature-map:check");
      expect(output).toContain(`${featureMap.coverage.expectedModuleCount} Harness modules`);

      expect(featureMap.apiVersion).toBe(1);
      expect(featureMap.features).toHaveLength(featureMap.coverage.expectedModuleCount);
      expect(featureMap.features.every((feature) => feature.showcasePromiseIds.length > 0)).toBe(
        true,
      );
    },
  );

  scenarioTest(
    "todo_backend.showcase.validation_guards_promise_and_module_coverage",
    "example validation catches promise, spec map, and module map drift",
    async () => {
      const checkOutput = runPnpmScript("example:todo:check");
      expect(checkOutput).toContain("spec map OK");
      expect(checkOutput).toContain("feature map OK");

      const reportOutput = runPnpmScript("example:todo:report");
      expect(reportOutput).toContain("Seed Harness Report");
      expect(reportOutput).toContain("The official Todo-Backend spec is completely mapped");
    },
  );

  scenarioTest(
    "todo_backend.showcase.cross_language_adapters_merge_evidence",
    "Vitest and Rust adapter shards merge into one run-scoped evidence model",
    async () => {
      const [{ events }, { implementationIds }] = await Promise.all([
        readAdapterEvents(),
        loadImplementationCatalog(),
      ]);
      const adapters = new Set(events.map((event) => event.adapter?.name));

      expect([...adapters]).toEqual(
        expect.arrayContaining(["harness-adapter-rust", "harness-adapter-vitest"]),
      );

      for (const implementationId of implementationIds) {
        expect(
          events.some(
            (event) =>
              implementationIdForEvent(event, implementationIds) === implementationId &&
              event.payload?.promiseId.startsWith("todo_backend.api.") &&
              event.payload?.labels?.implementation === implementationId &&
              event.payload?.status === "passing",
          ),
        ).toBe(true);
      }
    },
  );

  scenarioTest(
    "todo_backend.report.matrix_compares_implementations_by_promise",
    "matrix report compares TypeScript Hono and Rust Axum promise status side by side",
    async () => {
      const [matrix, officialApiPromiseIds, { implementationIds }] = await Promise.all([
        loadYaml(matrixPath),
        loadOfficialSpecPromiseIds(),
        loadImplementationCatalog(),
      ]);

      expect(matrix.apiVersion).toBe(1);
      expect(matrix.kind).toBe("TodoBackendImplementationMatrix");
      expect(matrix.implementations.map((implementation) => implementation.id)).toEqual(
        implementationIds,
      );

      for (const promiseId of officialApiPromiseIds) {
        for (const implementationId of implementationIds) {
          expectMatrixStatus(matrix, promiseId, implementationId, "passing");
        }
      }

      expectMatrixStatus(
        matrix,
        "todo_backend.typescript_hono.server_implements_contract",
        "typescript-hono",
        "passing",
      );
      expectMatrixStatus(
        matrix,
        "todo_backend.rust_axum.server_implements_contract",
        "rust-axum",
        "passing",
      );
    },
  );

  scenarioTest(
    "todo_backend.showcase.cli_reports_bilingual_promise_status",
    "Harness CLI renders the Todo-Backend report in English and Chinese",
    () => {
      const english = runHarnessCli(["report", "--summary", "--lang", "en"]);
      expect(english).toContain("Seed Harness Report");
      expect(english).toMatch(
        /P0\s+proposed\s+passing\s+Creating a todo returns the persisted todo/u,
      );

      const chinese = runHarnessCli(["report", "--summary", "--lang", "zh-CN"]);
      expect(chinese).toMatch(/P0\s+proposed\s+passing\s+创建 todo 会返回已持久化的 todo/u);
    },
  );

  scenarioTest(
    "todo_backend.showcase.one_command_runs_full_demo",
    "one Todo-Backend Harness command produces API, browser, native, report, and matrix evidence",
    async () => {
      const [resultsFile, matrix, { events }] = await Promise.all([
        readResultsFile(),
        loadYaml(matrixPath),
        readAdapterEvents(),
      ]);

      expect(matrix.generatedFrom.runId).toBeTruthy();
      expect(resultsPath).toContain(".harness/results.yaml");
      expect(matrix.summary.eventCount).toBeGreaterThanOrEqual(40);
      expect(events.length).toBeGreaterThanOrEqual(40);

      for (const promiseId of [
        "todo_backend.api.create_returns_persisted_todo",
        "todo_backend.api.update_changes_title_and_completed",
        "todo_backend.client.uses_real_backend_api",
        "todo_backend.typescript_hono.native_tests_are_promise_bound",
        "todo_backend.rust_axum.native_tests_are_promise_bound",
      ]) {
        expectPassingResult(resultsFile, promiseId);
      }
    },
  );
});
