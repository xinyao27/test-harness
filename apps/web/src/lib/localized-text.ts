import type { AppLocale } from "@/lib/i18n";

export type LocalizedText = string | Partial<Record<AppLocale, string>>;

export function localizeText(text: LocalizedText, locale: AppLocale): string {
  if (typeof text === "string") return text;

  return text[locale] ?? text["zh-CN"] ?? text.en ?? "";
}

export function localizeTexts(items: LocalizedText[], locale: AppLocale): string[] {
  return items.map((item) => localizeText(item, locale));
}
