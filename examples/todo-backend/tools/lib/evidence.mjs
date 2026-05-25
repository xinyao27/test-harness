import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parse, stringify } from "yaml";

import { collectFiles, loadYamlFile, requireArray } from "./yaml.mjs";

const libraryPath = fileURLToPath(import.meta.url);

export const exampleRoot = path.resolve(path.dirname(libraryPath), "../..");
export const repoRoot = path.resolve(exampleRoot, "../..");
export const implementationCatalogPath = path.join(exampleRoot, "implementations.yaml");
export const matrixPath = path.join(exampleRoot, "matrix.yaml");
export const resultsPath = path.join(exampleRoot, ".harness", "results.yaml");

const statusOrder = {
  failing: 3,
  skipped: 2,
  passing: 1,
  unknown: 0,
};

export const combineStatuses = (statuses) => {
  const known = statuses.filter((status) => status !== "unknown");
  if (known.length === 0) return "unknown";
  return known.reduce((selected, status) =>
    statusOrder[status] > statusOrder[selected] ? status : selected,
  );
};

export const resolveEventsDirectory = async () => {
  const configuredEventsDir = process.env.HARNESS_ADAPTER_EVENTS_DIR;
  if (configuredEventsDir) {
    return path.isAbsolute(configuredEventsDir)
      ? configuredEventsDir
      : path.join(exampleRoot, configuredEventsDir);
  }

  const configuredRunId = process.env.HARNESS_RUN_ID;
  if (configuredRunId) {
    return path.join(exampleRoot, ".harness", "runs", configuredRunId, "events");
  }

  const runsRoot = path.join(exampleRoot, ".harness", "runs");
  const runs = await readdir(runsRoot, { withFileTypes: true });
  const runDirectories = runs
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const latestRunId = runDirectories.at(-1);
  if (!latestRunId) {
    throw new Error("No Todo-Backend adapter run directory exists yet.");
  }

  return path.join(runsRoot, latestRunId, "events");
};

export const readAdapterEvents = async (eventsDirectory) => {
  const directory = eventsDirectory ?? (await resolveEventsDirectory());
  const entries = await readdir(directory, { withFileTypes: true });
  const eventFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ndjson"))
    .map((entry) => path.join(directory, entry.name))
    .sort();

  const events = [];
  for (const file of eventFiles) {
    const raw = await readFile(file, "utf8");
    for (const line of raw.split(/\r?\n/u)) {
      if (line.trim() === "") continue;
      events.push(JSON.parse(line));
    }
  }

  return {
    directory,
    events,
  };
};

export const readResultsFile = async () => parse(await readFile(resultsPath, "utf8"));

export const loadExamplePromiseRecords = async () => {
  const files = await collectFiles(path.join(exampleRoot, "promises"), ".promises.yaml");
  const records = new Map();

  for (const file of files) {
    const document = await loadYamlFile(file);
    for (const promise of requireArray(document?.promises, `${file}.promises`)) {
      records.set(promise.id, promise);
    }
  }

  return records;
};

export const loadOfficialSpecPromiseIds = async () => {
  const specMap = await loadYamlFile(path.join(exampleRoot, "spec-map.yaml"));
  const ids = new Set();

  for (const specCase of requireArray(specMap?.cases, "spec-map.yaml.cases")) {
    for (const promiseId of requireArray(specCase?.promiseIds, `${specCase.id}.promiseIds`)) {
      if (promiseId.startsWith("todo_backend.api.")) {
        ids.add(promiseId);
      }
    }
  }

  return [...ids].sort((left, right) => left.localeCompare(right));
};

export const loadImplementationCatalog = async () => {
  const catalog = await loadYamlFile(implementationCatalogPath);
  if (catalog?.apiVersion !== 1) {
    throw new Error("implementations.yaml must use apiVersion: 1");
  }
  if (catalog?.kind !== "TodoBackendImplementations") {
    throw new Error("implementations.yaml kind must be TodoBackendImplementations");
  }

  const implementations = requireArray(
    catalog?.implementations,
    "implementations.yaml.implementations",
  );
  const seenIds = new Set();

  for (const implementation of implementations) {
    if (typeof implementation?.id !== "string" || implementation.id.trim() === "") {
      throw new Error("Each Todo-Backend implementation must have a non-empty id.");
    }
    if (seenIds.has(implementation.id)) {
      throw new Error(`Duplicate Todo-Backend implementation id ${implementation.id}.`);
    }
    seenIds.add(implementation.id);

    if (typeof implementation?.name !== "string" || implementation.name.trim() === "") {
      throw new Error(`${implementation.id} must have a non-empty display name.`);
    }
    if (requireArray(implementation?.promiseIds, `${implementation.id}.promiseIds`).length === 0) {
      throw new Error(`${implementation.id} must list at least one implementation promise.`);
    }
  }

  return {
    implementationIds: implementations.map((implementation) => implementation.id),
    implementationPromiseIds: Object.fromEntries(
      implementations.map((implementation) => [implementation.id, implementation.promiseIds]),
    ),
    implementations,
  };
};

export const implementationIdForEvent = (event, implementationIds) => {
  const promiseId = event?.payload?.promiseId ?? "";
  const implementationLabel = event?.payload?.labels?.implementation;

  if (implementationIds.includes(implementationLabel)) return implementationLabel;
  if (implementationLabel) {
    throw new Error(`Unknown implementation label "${implementationLabel}" in ${promiseId}.`);
  }

  const implementationFromPromiseId = implementationIds.find((implementationId) =>
    promiseId.startsWith(`todo_backend.${implementationId.replaceAll("-", "_")}.`),
  );
  if (implementationFromPromiseId) return implementationFromPromiseId;

  return undefined;
};

const eventEvidence = (event) => ({
  adapter: event.adapter?.name,
  file: event.payload?.file,
  labels: event.payload?.labels,
  status: event.payload?.status,
  testName: event.payload?.testName,
});

const validateRequiredMatrixEvidence = (
  rows,
  officialApiPromiseIds,
  implementationIds,
  implementationPromiseIds,
) => {
  const missing = [];

  for (const promiseId of officialApiPromiseIds) {
    const row = rows.find((item) => item.id === promiseId);
    for (const implementationId of implementationIds) {
      if (!row?.implementations[implementationId]?.evidenceCount) {
        missing.push(`${promiseId} (${implementationId})`);
      }
    }
  }

  for (const [implementationId, promiseIds] of Object.entries(implementationPromiseIds)) {
    for (const promiseId of promiseIds) {
      const row = rows.find((item) => item.id === promiseId);
      if (!row?.implementations[implementationId]?.evidenceCount) {
        missing.push(`${promiseId} (${implementationId})`);
      }
    }
  }

  if (missing.length > 0) {
    throw new Error(`Todo-Backend matrix is missing required evidence: ${missing.join(", ")}`);
  }
};

export const buildImplementationMatrix = async () => {
  const [
    { directory, events },
    promiseRecords,
    officialApiPromiseIds,
    { implementationIds, implementationPromiseIds, implementations },
  ] = await Promise.all([
    readAdapterEvents(),
    loadExamplePromiseRecords(),
    loadOfficialSpecPromiseIds(),
    loadImplementationCatalog(),
  ]);

  const promiseIds = [...officialApiPromiseIds, ...Object.values(implementationPromiseIds).flat()];

  const unlabeledApiEvents = events.filter(
    (event) =>
      officialApiPromiseIds.includes(event?.payload?.promiseId) &&
      !event?.payload?.labels?.implementation,
  );
  if (unlabeledApiEvents.length > 0) {
    throw new Error(
      `Todo-Backend matrix requires structured implementation labels for API evidence: ${unlabeledApiEvents
        .map((event) => event.payload?.testName)
        .join(", ")}`,
    );
  }

  const rows = promiseIds.map((promiseId) => {
    const promiseRecord = promiseRecords.get(promiseId);
    const implementations = Object.fromEntries(
      implementationIds.map((implementationId) => {
        const evidence = events
          .filter((event) => event?.payload?.promiseId === promiseId)
          .filter(
            (event) => implementationIdForEvent(event, implementationIds) === implementationId,
          )
          .map(eventEvidence);

        return [
          implementationId,
          {
            evidence,
            evidenceCount: evidence.length,
            status: combineStatuses(evidence.map((item) => item.status)),
          },
        ];
      }),
    );

    return {
      id: promiseId,
      implementations,
      priority: promiseRecord?.priority,
      title: promiseRecord?.title,
    };
  });

  validateRequiredMatrixEvidence(
    rows,
    officialApiPromiseIds,
    implementationIds,
    implementationPromiseIds,
  );

  return {
    apiVersion: 1,
    generatedAt: new Date().toISOString(),
    generatedFrom: {
      eventsDirectory: path.relative(repoRoot, directory),
      runId: process.env.HARNESS_RUN_ID ?? path.basename(path.dirname(directory)),
    },
    implementations: implementations.map((implementation) => ({
      id: implementation.id,
      name: implementation.name,
    })),
    kind: "TodoBackendImplementationMatrix",
    promises: rows,
    summary: {
      eventCount: events.length,
      promiseCount: rows.length,
    },
  };
};

export const writeImplementationMatrix = async () => {
  const matrix = await buildImplementationMatrix();
  await writeFile(matrixPath, stringify(matrix), "utf8");
  return matrix;
};
