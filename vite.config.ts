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
    // vp check only understands the JS/TS toolchain, so staged Rust would
    // otherwise reach CI unformatted and fail `cargo fmt --all --check`.
    // Run rustfmt on staged *.rs (edition 2021, matching the workspace);
    // vp staged re-stages whatever rustfmt rewrites. Requires the rustfmt
    // component (`rustup component add rustfmt`).
    "*.rs": "rustfmt --edition 2021",
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
    reporters: ["default", "./packages/adapter-vitest/src/reporter.ts"],
  },
});
