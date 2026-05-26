#!/usr/bin/env node
import path from "node:path";

import { matrixPath, repoRoot, writeImplementationMatrix } from "./lib/evidence.mjs";

try {
  const matrix = await writeImplementationMatrix();
  console.log(
    `Todo-Backend implementation matrix OK: ${matrix.summary.promiseCount} promises from ${matrix.summary.eventCount} adapter events -> ${path.relative(
      repoRoot,
      matrixPath,
    )}.`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
