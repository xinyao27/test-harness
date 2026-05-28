/**
 * Real binding for `harness.web_dashboard.i18n_switches_chrome_and_snapshot_text`.
 *
 * Replaces the contract-mirror in packages/adapter-vitest/tests with a test
 * that imports the actual `localizeText` implementation Studio uses, plus
 * the live message catalogs. If either drifts from what the promise says,
 * this test fails — not a hand-mirrored copy.
 *
 * Persistence across browser sessions (localStorage) is still browser-side
 * behavior covered separately by the Studio settings flow; the focus here
 * is the rendering contract every locale switch depends on.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { scenarioTest } from "@test-harness/adapter-vitest";
import { describe, expect } from "vitest";

import { localizeText, localizeTexts } from "./localized-text";

const __dirname = dirname(fileURLToPath(import.meta.url));
// apps/web/src/lib → ../../../packages/i18n/messages
const MESSAGES_DIR = resolve(__dirname, "../../../../packages/i18n/messages");

function loadCatalog(name: string): Record<string, string> {
  const raw = readFileSync(resolve(MESSAGES_DIR, name), "utf8");
  const parsed = JSON.parse(raw) as Record<string, string>;
  const { ["$schema"]: _, ...messages } = parsed;
  return messages;
}

describe("Studio i18n locale switch", () => {
  scenarioTest(
    "harness.web_dashboard.i18n_switches_chrome_and_snapshot_text",
    "the real localizeText resolves the requested locale with documented fallback, and the message catalogs declare the same keys",
    () => {
      // -- Contract 1: message-key parity in the real catalogs ----------------
      const en = loadCatalog("en.json");
      const zh = loadCatalog("zh-CN.json");
      const enKeys = new Set(Object.keys(en));
      const zhKeys = new Set(Object.keys(zh));
      expect(
        [...enKeys].filter((key) => !zhKeys.has(key)).sort(),
        "keys present in en but missing in zh-CN",
      ).toEqual([]);
      expect(
        [...zhKeys].filter((key) => !enKeys.has(key)).sort(),
        "keys present in zh-CN but missing in en",
      ).toEqual([]);
      for (const [key, value] of Object.entries(en)) {
        expect(value.length, `en[${key}] empty`).toBeGreaterThan(0);
      }
      for (const [key, value] of Object.entries(zh)) {
        expect(value.length, `zh-CN[${key}] empty`).toBeGreaterThan(0);
      }

      // -- Contract 2: the *real* localizeText, not a hand-mirror -------------
      // Requested locale wins when present.
      expect(localizeText({ en: "Hello", "zh-CN": "你好" }, "en")).toBe("Hello");
      expect(localizeText({ en: "Hello", "zh-CN": "你好" }, "zh-CN")).toBe("你好");

      // Plain strings pass through.
      expect(localizeText("Plain", "en")).toBe("Plain");
      expect(localizeText("Plain", "zh-CN")).toBe("Plain");

      // Fallback chain documented in localized-text.ts: requested → zh-CN → en → "".
      expect(localizeText({ "zh-CN": "你好" }, "en")).toBe("你好");
      expect(localizeText({ en: "Hello" }, "zh-CN")).toBe("Hello");
      expect(localizeText({}, "en")).toBe("");

      // The Array variant maps each entry through the same resolver.
      expect(
        localizeTexts(
          [{ en: "One", "zh-CN": "一" }, { en: "Two", "zh-CN": "二" }, "Three"],
          "zh-CN",
        ),
      ).toEqual(["一", "二", "Three"]);
    },
  );
});
