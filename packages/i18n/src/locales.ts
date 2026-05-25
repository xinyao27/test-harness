export const harnessLocales = ["zh-CN", "en"] as const;
export const harnessBaseLocale = "zh-CN";
export const harnessLocalePreferenceCodes = ["system", ...harnessLocales] as const;

export type HarnessLocale = (typeof harnessLocales)[number];
export type HarnessLocalePreference = (typeof harnessLocalePreferenceCodes)[number];

export const isHarnessLocale = (value: unknown): value is HarnessLocale =>
  typeof value === "string" && (harnessLocales as readonly string[]).includes(value);

export const isHarnessLocalePreference = (value: unknown): value is HarnessLocalePreference =>
  typeof value === "string" && (harnessLocalePreferenceCodes as readonly string[]).includes(value);
