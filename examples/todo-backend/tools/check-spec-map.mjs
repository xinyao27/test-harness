#!/usr/bin/env node
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
const specMapPath = path.join(exampleRoot, "spec-map.yaml");
const promisesDir = path.join(exampleRoot, "promises");

async function loadPromiseIds() {
  const files = await collectFiles(promisesDir, ".promises.yaml");
  const ids = new Map();

  for (const file of files) {
    const relativePath = path.relative(exampleRoot, file);
    const document = await loadYamlFile(file);

    requireApiVersionOne(document, relativePath);

    for (const promise of requireArray(document?.promises, `${relativePath}.promises`)) {
      const id = requireString(promise?.id, `${relativePath} promise id`);
      if (ids.has(id)) {
        fail(`duplicate promise id ${id} in ${relativePath} and ${ids.get(id)}`);
      } else {
        ids.set(id, relativePath);
      }
    }
  }

  return ids;
}

function validateSpecMap(specMap, promiseIds) {
  if (specMap?.apiVersion !== 1) {
    fail("Todo-Backend spec map check failed: spec-map.yaml must use apiVersion: 1");
  }

  if (specMap?.kind !== "TodoBackendSpecMap") {
    fail("Todo-Backend spec map check failed: spec-map.yaml kind must be TodoBackendSpecMap");
  }

  requireString(specMap?.source?.url, "source.url");
  requireString(specMap?.source?.commit, "source.commit");
  requireString(specMap?.source?.retrievedAt, "source.retrievedAt");

  const expectedCaseCount = specMap?.coverage?.expectedCaseCount;
  if (!Number.isInteger(expectedCaseCount) || expectedCaseCount <= 0) {
    fail("coverage.expectedCaseCount must be a positive integer");
  }

  const cases = requireArray(specMap?.cases, "cases");
  if (Number.isInteger(expectedCaseCount) && cases.length !== expectedCaseCount) {
    fail(`expected ${expectedCaseCount} official cases, found ${cases.length}`);
  }

  const caseIds = new Set();
  const coveredPromiseIds = new Set();

  for (const [index, specCase] of cases.entries()) {
    const caseLabel = `cases[${index}]`;
    const caseId = requireString(specCase?.id, `${caseLabel}.id`);
    requireString(specCase?.sourceSection, `${caseLabel}.sourceSection`);
    requireString(specCase?.sourceCase, `${caseLabel}.sourceCase`);

    if (caseIds.has(caseId)) {
      fail(`duplicate spec case id ${caseId}`);
    }
    caseIds.add(caseId);

    const mappedIds = requireArray(specCase?.promiseIds, `${caseLabel}.promiseIds`);
    if (mappedIds.length === 0) {
      fail(`${caseId} must map to at least one promise id`);
    }

    for (const promiseId of mappedIds) {
      if (typeof promiseId !== "string" || promiseId.trim() === "") {
        fail(`${caseId} has a blank promise id`);
      }

      if (!promiseIds.has(promiseId)) {
        fail(`${caseId} maps to unknown promise id ${promiseId}`);
      }

      coveredPromiseIds.add(promiseId);
    }
  }

  return {
    caseCount: cases.length,
    coveredPromiseCount: coveredPromiseIds.size,
  };
}

const promiseIds = await loadPromiseIds();
const specMap = await loadYamlFile(specMapPath);
const summary = validateSpecMap(specMap, promiseIds);

console.log(
  `Todo-Backend spec map OK: ${summary.caseCount} official cases mapped to ${summary.coveredPromiseCount} promises.`,
);
