import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
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
    sortTailwindcss: {},
  },
  test: {
    passWithNoTests: true,
  },
  server: {
    host: "127.0.0.1",
    port: 47627,
  },
  preview: {
    host: "127.0.0.1",
    port: 47628,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
