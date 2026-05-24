import type { LocalizedText } from "./schema.ts";

export const defaultLanguage = "en";

const isLocalizedMap = (text: LocalizedText): text is Readonly<Record<string, string>> =>
  typeof text === "object" && text !== null;

export const languageFallbacks = (language = defaultLanguage): readonly string[] => {
  const baseLanguage = language.split("-")[0];
  const candidates = [language];
  if (baseLanguage && baseLanguage !== language) candidates.push(baseLanguage);
  if (!candidates.includes(defaultLanguage)) candidates.push(defaultLanguage);
  return candidates;
};

export const resolveLocalizedText = (text: LocalizedText, language = defaultLanguage): string => {
  if (typeof text === "string") return text;

  for (const candidate of languageFallbacks(language)) {
    const value = text[candidate];
    if (value?.trim()) return value;
  }

  return Object.values(text).find((value) => value.trim()) ?? "";
};

export const isLocalizedTextBlank = (text: LocalizedText): boolean =>
  resolveLocalizedText(text).trim().length === 0;

export const hasDefaultLanguageText = (text: LocalizedText): boolean => {
  if (!isLocalizedMap(text)) return text.trim().length > 0;
  return Boolean(text[defaultLanguage]?.trim());
};
