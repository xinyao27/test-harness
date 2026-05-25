import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { parse } from "yaml";

export function fail(message) {
  console.error(message);
  process.exit(1);
  throw new Error(message);
}

export async function collectFiles(directory, suffix) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    fail(`Cannot read directory ${directory}: ${error.message}`);
  }

  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(entryPath, suffix)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(suffix)) {
      files.push(entryPath);
    }
  }

  return files.sort((left, right) => left.localeCompare(right));
}

export async function loadYamlFile(filePath) {
  try {
    const raw = await readFile(filePath, "utf8");
    return parse(raw);
  } catch (error) {
    fail(`Cannot load YAML file ${filePath}: ${error.message}`);
  }
}

export function requireString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    fail(`${label} must be a non-empty string`);
  }

  return value;
}

export function requireArray(value, label) {
  if (!Array.isArray(value)) {
    fail(`${label} must be an array`);
  }

  return value;
}

export function requireApiVersionOne(document, label) {
  if (document?.apiVersion !== 1) {
    fail(`${label} must use apiVersion: 1`);
  }
}
