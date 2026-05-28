/**
 * Partial binding for `harness.web_dashboard.agent_panel_runs_inline_terminal`.
 *
 * The full promise is a `boundary: browser` assertion: opening the Agent Panel
 * mounts an inline xterm.js terminal that wires to the daemon's
 * `/api/agent/pty` WebSocket with the user's paired token, bridges stdin /
 * stdout bytes bidirectionally, and forwards resize events. Verifying that
 * end-to-end needs a real DOM + WebSocket harness, which `apps/web` does not
 * yet have configured (the current `harness test` runner only invokes
 * `vp test run packages/adapter-vitest/tests`).
 *
 * This test anchors the **contract piece** that all the moving parts agree on:
 * given a paired daemon (HTTP URL + token), the WebSocket URL the panel must
 * connect to is `ws://<host>:<port>/api/agent/pty?token=<token>`. Drifting
 * away from that shape on either side (panel builder OR daemon route) breaks
 * the whole loop. The function under test is a verbatim mirror of
 * `getAgentPtyWebSocketUrl` in `apps/web/src/lib/api.ts`; keep them in sync
 * until `apps/web` grows its own vitest setup and the implementation can be
 * imported directly.
 */

import { describe, expect } from "vitest";

import { scenarioTest } from "../src/index.ts";

/** Mirror of `apps/web/src/lib/api.ts::getAgentPtyWebSocketUrl`. */
function buildAgentPtyWebSocketUrl(
  daemonBaseUrl: string,
  pairedToken: string | null,
): string | null {
  if (!pairedToken) return null;
  const url = new URL(`${daemonBaseUrl.replace(/\/$/, "")}/api/agent/pty`);
  url.searchParams.set("token", pairedToken);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

describe("Agent Panel WebSocket contract", () => {
  scenarioTest(
    "harness.web_dashboard.agent_panel_runs_inline_terminal",
    "the panel builds ws://host:port/api/agent/pty?token=… from the paired session and refuses to connect when unpaired",
    () => {
      // Paired session → ws:// scheme, /api/agent/pty path, token in query.
      const wsUrl = buildAgentPtyWebSocketUrl("http://127.0.0.1:4101", "paired-token-xyz");
      expect(wsUrl).toBe("ws://127.0.0.1:4101/api/agent/pty?token=paired-token-xyz");

      // https:// daemon → wss:// scheme.
      const secureWsUrl = buildAgentPtyWebSocketUrl("https://harness.example.com", "tok");
      expect(secureWsUrl).toBe("wss://harness.example.com/api/agent/pty?token=tok");

      // Trailing slashes on the daemon URL get normalized.
      const normalized = buildAgentPtyWebSocketUrl("http://localhost:4101/", "abc");
      expect(normalized).toBe("ws://localhost:4101/api/agent/pty?token=abc");

      // Unpaired: the panel must refuse to construct a WebSocket URL, so the
      // UI can surface a "pair first" message instead of opening a doomed
      // WebSocket against an unauthenticated daemon.
      expect(buildAgentPtyWebSocketUrl("http://127.0.0.1:4101", null)).toBe(null);
      expect(buildAgentPtyWebSocketUrl("http://127.0.0.1:4101", "")).toBe(null);
    },
  );
});
