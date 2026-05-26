#!/usr/bin/env node
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  collectFiles,
  fail,
  loadYamlFile,
  requireApiVersionOne,
  requireArray,
  requireString,
} from "./lib/yaml.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const exampleRoot = path.resolve(path.dirname(scriptPath), "..");
const repoRoot = path.resolve(exampleRoot, "../..");
const featureMapPath = path.join(exampleRoot, "tests/harness-feature-map.yaml");
const packageJsonPath = path.join(repoRoot, "package.json");

function sameStringSet(left, right) {
  if (left.size !== right.size) {
    return false;
  }

  for (const value of left) {
    if (!right.has(value)) {
      return false;
    }
  }

  return true;
}

async function loadPackageScripts() {
  const raw = await readFile(packageJsonPath, "utf8");
  const packageJson = JSON.parse(raw);
  return new Set(Object.keys(packageJson.scripts ?? {}));
}

async function assertCurrentArtifactExists(artifact) {
  if (artifact.includes("*")) {
    fail(
      `Todo-Backend feature map check failed: current artifact must be a concrete path: ${artifact}`,
    );
  }

  const absolutePath = path.resolve(repoRoot, artifact);
  const relativePath = path.relative(repoRoot, absolutePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    fail(`Todo-Backend feature map check failed: artifact escapes repository root: ${artifact}`);
  }

  try {
    await stat(absolutePath);
  } catch {
    fail(`Todo-Backend feature map check failed: current artifact does not exist: ${artifact}`);
  }
}

function assertImplementedCommandExists(command, packageScripts) {
  const match = /^pnpm (?<script>[\w:.-]+)$/.exec(command);
  if (!match?.groups?.script) {
    fail(
      `Todo-Backend feature map check failed: implemented command must be "pnpm <script>": ${command}`,
    );
  }

  const script = match.groups.script;
  if (!packageScripts.has(script)) {
    fail(
      `Todo-Backend feature map check failed: implemented command has no package.json script: ${command}`,
    );
  }
}

async function loadRootModules() {
  const files = await collectFiles(path.join(repoRoot, "tests/modules"), ".module.yaml");
  const modules = new Map();
  const promiseIds = new Set();

  for (const file of files) {
    const relativePath = path.relative(repoRoot, file);
    const document = await loadYamlFile(file);
    requireApiVersionOne(document, relativePath);

    const id = requireString(document?.id, `${relativePath}.id`);
    const promises = requireArray(document?.promises, `${relativePath}.promises`);

    if (modules.has(id)) {
      fail(`Todo-Backend feature map check failed: duplicate root module id ${id}`);
    }

    modules.set(id, {
      promises: new Set(
        promises.map((promiseId) => requireString(promiseId, `${relativePath}.promises[]`)),
      ),
      relativePath,
    });

    for (const promiseId of promises) {
      promiseIds.add(promiseId);
    }
  }

  return { modules, promiseIds };
}

async function loadExamplePromiseIds() {
  const files = await collectFiles(path.join(exampleRoot, "tests/promises"), ".promises.yaml");
  const ids = new Set();

  for (const file of files) {
    const relativePath = path.relative(exampleRoot, file);
    const document = await loadYamlFile(file);
    requireApiVersionOne(document, relativePath);

    for (const promise of requireArray(document?.promises, `${relativePath}.promises`)) {
      const id = requireString(promise?.id, `${relativePath} promise id`);
      if (ids.has(id)) {
        fail(`Todo-Backend feature map check failed: duplicate example promise id ${id}`);
      }
      ids.add(id);
    }
  }

  return ids;
}

async function validateExampleModules(examplePromiseIds) {
  const files = await collectFiles(path.join(exampleRoot, "tests/modules"), ".module.yaml");
  if (files.length === 0) {
    fail("Todo-Backend feature map check failed: expected example modules");
  }

  for (const file of files) {
    const relativePath = path.relative(exampleRoot, file);
    const document = await loadYamlFile(file);
    requireApiVersionOne(document, relativePath);
    requireString(document?.id, `${relativePath}.id`);

    for (const promiseId of requireArray(document?.promises, `${relativePath}.promises`)) {
      if (!examplePromiseIds.has(promiseId)) {
        fail(
          `Todo-Backend feature map check failed: ${relativePath} references unknown example promise ${promiseId}`,
        );
      }
    }
  }
}

async function validateFeatureMap(
  featureMap,
  rootModules,
  rootPromiseIds,
  examplePromiseIds,
  packageScripts,
) {
  requireApiVersionOne(featureMap, "tests/harness-feature-map.yaml");

  if (featureMap?.kind !== "TodoBackendHarnessFeatureMap") {
    fail(
      "Todo-Backend feature map check failed: tests/harness-feature-map.yaml kind must be TodoBackendHarnessFeatureMap",
    );
  }

  const expectedModuleCount = featureMap?.coverage?.expectedModuleCount;
  if (!Number.isInteger(expectedModuleCount) || expectedModuleCount <= 0) {
    fail(
      "Todo-Backend feature map check failed: coverage.expectedModuleCount must be a positive integer",
    );
  } else if (expectedModuleCount !== rootModules.size) {
    fail(
      `Todo-Backend feature map check failed: expected ${expectedModuleCount} root modules, found ${rootModules.size}`,
    );
  }

  const expectedHarnessPromiseCount = featureMap?.coverage?.expectedHarnessPromiseCount;
  if (!Number.isInteger(expectedHarnessPromiseCount) || expectedHarnessPromiseCount <= 0) {
    fail(
      "Todo-Backend feature map check failed: coverage.expectedHarnessPromiseCount must be a positive integer",
    );
  } else if (expectedHarnessPromiseCount !== rootPromiseIds.size) {
    fail(
      `Todo-Backend feature map check failed: expected ${expectedHarnessPromiseCount} root module promises, found ${rootPromiseIds.size}`,
    );
  }

  const features = requireArray(featureMap?.features, "features");
  if (features.length !== rootModules.size) {
    fail(
      `Todo-Backend feature map check failed: expected ${rootModules.size} feature entries, found ${features.length}`,
    );
  }

  const seenModuleIds = new Set();

  for (const [index, feature] of features.entries()) {
    const label = `features[${index}]`;
    const moduleId = requireString(feature?.moduleId, `${label}.moduleId`);
    const rootModule = rootModules.get(moduleId);
    if (!rootModule) {
      fail(`Todo-Backend feature map check failed: unknown root module ${moduleId}`);
    }

    if (seenModuleIds.has(moduleId)) {
      fail(`Todo-Backend feature map check failed: duplicate feature entry for ${moduleId}`);
    }
    seenModuleIds.add(moduleId);

    const harnessPromiseIds = new Set(
      requireArray(feature?.harnessPromiseIds, `${label}.harnessPromiseIds`).map((promiseId) =>
        requireString(promiseId, `${label}.harnessPromiseIds[]`),
      ),
    );

    if (!sameStringSet(harnessPromiseIds, rootModule.promises)) {
      fail(
        `Todo-Backend feature map check failed: ${moduleId} harnessPromiseIds do not match ${rootModule.relativePath}`,
      );
    }

    const showcasePromiseIds = requireArray(
      feature?.showcasePromiseIds,
      `${label}.showcasePromiseIds`,
    );
    if (showcasePromiseIds.length === 0) {
      fail(
        `Todo-Backend feature map check failed: ${moduleId} must map to at least one showcase promise`,
      );
    }

    for (const promiseId of showcasePromiseIds) {
      if (!examplePromiseIds.has(promiseId)) {
        fail(
          `Todo-Backend feature map check failed: ${moduleId} maps to unknown showcase promise ${promiseId}`,
        );
      }
    }

    const currentArtifacts = requireArray(feature?.currentArtifacts, `${label}.currentArtifacts`);
    const plannedArtifacts = requireArray(feature?.plannedArtifacts, `${label}.plannedArtifacts`);
    if (currentArtifacts.length + plannedArtifacts.length === 0) {
      fail(
        `Todo-Backend feature map check failed: ${moduleId} must list current or planned artifacts`,
      );
    }

    for (const artifact of currentArtifacts) {
      await assertCurrentArtifactExists(requireString(artifact, `${label}.currentArtifacts[]`));
    }

    for (const artifact of plannedArtifacts) {
      requireString(artifact, `${label}.plannedArtifacts[]`);
    }

    const implementedCommands = requireArray(
      feature?.implementedCommands,
      `${label}.implementedCommands`,
    );
    const plannedCommands = requireArray(feature?.plannedCommands, `${label}.plannedCommands`);
    if (implementedCommands.length + plannedCommands.length === 0) {
      fail(
        `Todo-Backend feature map check failed: ${moduleId} must list implemented or planned commands`,
      );
    }

    for (const command of implementedCommands) {
      assertImplementedCommandExists(
        requireString(command, `${label}.implementedCommands[]`),
        packageScripts,
      );
    }

    for (const command of plannedCommands) {
      requireString(command, `${label}.plannedCommands[]`);
    }
  }

  for (const moduleId of rootModules.keys()) {
    if (!seenModuleIds.has(moduleId)) {
      fail(`Todo-Backend feature map check failed: missing feature entry for ${moduleId}`);
    }
  }
}

const { modules: rootModules, promiseIds: rootPromiseIds } = await loadRootModules();
const examplePromiseIds = await loadExamplePromiseIds();
const packageScripts = await loadPackageScripts();
await validateExampleModules(examplePromiseIds);
const featureMap = await loadYamlFile(featureMapPath);
await validateFeatureMap(
  featureMap,
  rootModules,
  rootPromiseIds,
  examplePromiseIds,
  packageScripts,
);

console.log(
  `Todo-Backend feature map OK: ${rootModules.size} Harness modules and ${rootPromiseIds.size} module promises mapped.`,
);
