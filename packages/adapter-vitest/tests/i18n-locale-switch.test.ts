/**
 * Partial binding for `harness.web_dashboard.i18n_switches_chrome_and_snapshot_text`.
 *
 * The full promise is a `boundary: browser` assertion: selecting a supported
 * locale re-renders the Studio chrome + LocalizedText-driven snapshot content
 * and persists the choice for the next session. Persistence (localStorage)
 * needs a real browser; that piece waits on `apps/web` getting its own
 * Vitest setup.
 *
 * What we lock in here — under the only test runner currently wired into
 * `harness test` — are the two contracts every locale switch depends on:
 *
 *   1. The canonical i18n message catalogs (`packages/i18n/messages/en.json`
 *      and `zh-CN.json`) declare exactly the same set of keys. Any key that
 *      exists in only one locale is missing-translation drift; the runtime
 *      message accessor would silently fall back, and the UI would render
 *      English text inside a Chinese chrome (or vice versa).
 *
 *   2. The `LocalizedText` resolver semantics (mirroring
 *      `apps/web/src/lib/localized-text.ts`): given a `{ en, zh-CN }` map,
 *      return the requested locale, fall back to zh-CN, then en, then "".
 *      Plain strings pass through unchanged. This is the function Studio
 *      uses to render every module title, promise title, purpose, etc., so
 *      it is the central piece behind "snapshot text follows the locale".
 *
 * Keep the resolver in sync with `apps/web/src/lib/localized-text.ts` until
 * `apps/web` grows its own vitest config and we can import directly.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect } from "vitest";

import { scenarioTest } from "../src/index.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MESSAGES_DIR = resolve(__dirname, "../../i18n/messages");

type LocalizedText = string | Partial<Record<"en" | "zh-CN", string>>;

/** Mirror of `apps/web/src/lib/localized-text.ts::localizeText`. */
function resolveLocalizedText(text: LocalizedText, locale: "en" | "zh-CN"): string {
  if (typeof text === "string") return text;
  return text[locale] ?? text["zh-CN"] ?? text.en ?? "";
}

function loadCatalog(name: string): Record<string, string> {
  const raw = readFileSync(resolve(MESSAGES_DIR, name), "utf8");
  const parsed = JSON.parse(raw) as Record<string, string>;
  // Drop the `$schema` field — it is not a translatable message.
  const { ["$schema"]: _, ...messages } = parsed;
  return messages;
}

describe("Studio i18n locale switch", () => {
  scenarioTest(
    "harness.web_dashboard.i18n_switches_chrome_and_snapshot_text",
    "en.json and zh-CN.json declare the same keys, and the LocalizedText resolver picks the requested locale with documented fallback",
    () => {
      // -- Contract 1: message-key parity -------------------------------------
      const en = loadCatalog("en.json");
      const zh = loadCatalog("zh-CN.json");

      const enKeys = new Set(Object.keys(en));
      const zhKeys = new Set(Object.keys(zh));

      const onlyInEn = [...enKeys].filter((key) => !zhKeys.has(key)).sort();
      const onlyInZh = [...zhKeys].filter((key) => !enKeys.has(key)).sort();
      expect(onlyInEn, "keys present in en but missing in zh-CN").toEqual([]);
      expect(onlyInZh, "keys present in zh-CN but missing in en").toEqual([]);

      // Every value must be a non-empty string — empty translations would
      // render blank chrome on a locale switch.
      for (const [key, value] of Object.entries(en)) {
        expect(typeof value, `en[${key}] type`).toBe("string");
        expect(value.length, `en[${key}] empty`).toBeGreaterThan(0);
      }
      for (const [key, value] of Object.entries(zh)) {
        expect(typeof value, `zh-CN[${key}] type`).toBe("string");
        expect(value.length, `zh-CN[${key}] empty`).toBeGreaterThan(0);
      }

      // -- Contract 2: LocalizedText resolver semantics ----------------------
      // Requested locale wins when present.
      expect(resolveLocalizedText({ en: "Hello", "zh-CN": "你好" }, "en")).toBe("Hello");
      expect(resolveLocalizedText({ en: "Hello", "zh-CN": "你好" }, "zh-CN")).toBe("你好");

      // Plain strings pass through.
      expect(resolveLocalizedText("Plain", "en")).toBe("Plain");
      expect(resolveLocalizedText("Plain", "zh-CN")).toBe("Plain");

      // Requested locale missing → fall back to zh-CN, then en, then "".
      expect(resolveLocalizedText({ "zh-CN": "你好" }, "en")).toBe("你好");
      expect(resolveLocalizedText({ en: "Hello" }, "zh-CN")).toBe("Hello");
      expect(resolveLocalizedText({}, "en")).toBe("");
    },
  );
});
