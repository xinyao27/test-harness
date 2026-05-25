import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { CompilerOptions } from "@inlang/paraglide-js";

export {
  harnessBaseLocale,
  harnessLocalePreferenceCodes,
  harnessLocales,
  isHarnessLocale,
  isHarnessLocalePreference,
  type HarnessLocale,
  type HarnessLocalePreference,
} from "./locales";

const packageRoot = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));

export const paraglideProjectPath = resolve(packageRoot, "project.inlang");
export const paraglideOutdir = resolve(packageRoot, "src/paraglide");

export const paraglideCompilerOptions = {
  emitTsDeclarations: true,
  isServer: "typeof window === 'undefined'",
  outdir: paraglideOutdir,
  project: paraglideProjectPath,
  strategy: ["localStorage", "preferredLanguage", "baseLocale"],
} satisfies CompilerOptions;
