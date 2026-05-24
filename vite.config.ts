import { readdirSync } from "node:fs";
import { resolve } from "node:path";

import { defineConfig } from "vite-plus";

// Dynamically generate resolve aliases for all workspace packages so Vitest
// resolves workspace imports to source files (not dist), letting `vp test`
// run without a prior build step.
const SCOPE = "@test-harness";
const PACKAGES_DIR = resolve(import.meta.dirname, "packages");

const workspaceAlias: Record<string, string> = {};
for (const entry of readdirSync(PACKAGES_DIR, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  workspaceAlias[`${SCOPE}/${entry.name}`] = resolve(PACKAGES_DIR, entry.name, "src");
}

export default defineConfig({
  resolve: {
    alias: workspaceAlias,
  },
  staged: {
    "*": "vp check --fix",
  },
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {
    sortImports: {},
    sortPackageJson: true,
  },
  run: {
    cache: true,
  },
  test: {
    reporters: ["default", "./packages/core/src/vitest-reporter.ts"],
  },
});
