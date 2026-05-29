import { FitAddon } from "@xterm/addon-fit";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal } from "@xterm/xterm";

import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef, useState } from "react";

import { type PtyCardKind } from "@/features/studio/agent-cards-store";
import { pickTerminalTheme } from "@/features/studio/terminal-theme";
import { getAgentPtyWebSocketUrl, type AgentTool } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

export type PtyConnectionState = "idle" | "connecting" | "connected" | "closed" | "unpaired";

/**
 * A live pty session over the local daemon's `/api/agent/pty` WebSocket, rendered with
 * xterm.js. Framework-agnostic (NO React Flow) so it can be hosted by both the canvas
 * `PtyCardNode` and the fixed module workspace tools island.
 *
 * Two properties matter for embedded workspace surfaces:
 *   - The internal `ResizeObserver` re-fits cols/rows whenever the container resizes
 *     (window resize, responsive column changes, collapsible islands) so the pty fits
 *     its visible box.
 *   - The component owns the WebSocket lifetime, so host surfaces can switch around it
 *     without needing React Flow-specific terminal code.
 */
export function PtyTerminal({
  kind,
  tool = "claude",
  initialPrompt = null,
  onStateChange,
  className,
}: {
  kind: PtyCardKind;
  tool?: AgentTool | null;
  initialPrompt?: string | null;
  onStateChange?: (state: PtyConnectionState) => void;
  className?: string;
}) {
  const { locale, m } = useI18n();
  const { mode: themeMode } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  // Hold the live xterm instance so a theme-mode change can update its palette without
  // tearing down the WebSocket / pty session.
  const terminalRef = useRef<Terminal | null>(null);
  const [state, setState] = useState<PtyConnectionState>("idle");

  useEffect(() => {
    onStateChange?.(state);
  }, [state, onStateChange]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const url = getAgentPtyWebSocketUrl(kind, tool ?? "claude");
    if (!url) {
      setState("unpaired");
      return;
    }

    const terminal: Terminal = new Terminal({
      cursorBlink: true,
      fontFamily: '"Geist Mono Variable", ui-monospace, monospace',
      fontSize: 12,
      scrollback: 200_000,
      allowProposedApi: true,
      allowTransparency: true,
      theme: pickTerminalTheme(themeMode),
    });
    terminalRef.current = terminal;
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(container);

    const unicode11 = new Unicode11Addon();
    terminal.loadAddon(unicode11);
    terminal.unicode.activeVersion = "11";

    let webgl: WebglAddon | null = null;
    try {
      webgl = new WebglAddon();
      webgl.onContextLoss(() => {
        webgl?.dispose();
        webgl = null;
      });
      terminal.loadAddon(webgl);
    } catch {
      webgl = null;
    }

    let socket: WebSocket | null = null;
    let cancelled = false;
    let dataDisposable: { dispose: () => void } | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    let initialPromptTimer: ReturnType<typeof setTimeout> | null = null;

    // Coalesce rapid inbound pty data into a single `term.write()` per tick (5ms),
    // the same as VS Code's TerminalDataBufferer — avoids partial-paint flicker.
    const DATA_BUFFER_FLUSH_MS = 5;
    let dataBuffer: Array<string | Uint8Array> = [];
    let flushTimer: ReturnType<typeof setTimeout> | undefined;
    const flushData = () => {
      flushTimer = undefined;
      if (dataBuffer.length === 0) return;
      const chunks = dataBuffer;
      dataBuffer = [];
      for (const chunk of chunks) {
        terminal.write(chunk);
      }
    };

    // Double-rAF so the container has its FINAL layout size before we measure / spawn
    // the pty at the right cols/rows.
    const raf1 = requestAnimationFrame(() => {
      if (cancelled) return;
      requestAnimationFrame(() => {
        if (cancelled) return;
        try {
          fit.fit();
        } catch {
          /* container not yet sized — ResizeObserver will retry */
        }

        setState("connecting");
        socket = new WebSocket(url);
        socket.binaryType = "arraybuffer";

        socket.addEventListener("open", () => {
          setState("connected");
          if (!socket) return;
          sendResize(socket, terminal);
          if (initialPrompt) {
            const prompt = initialPrompt;
            initialPromptTimer = setTimeout(() => {
              if (cancelled || socket?.readyState !== WebSocket.OPEN) return;
              socket.send(new TextEncoder().encode(formatInitialPromptForPty(prompt)));
            }, 1800);
          }
        });
        socket.addEventListener("message", (event) => {
          if (typeof event.data === "string") {
            dataBuffer.push(event.data);
          } else if (event.data instanceof ArrayBuffer) {
            dataBuffer.push(new Uint8Array(event.data));
          } else {
            return;
          }
          if (flushTimer === undefined) {
            flushTimer = setTimeout(flushData, DATA_BUFFER_FLUSH_MS);
          }
        });
        socket.addEventListener("close", () => setState("closed"));
        socket.addEventListener("error", () => setState("closed"));

        dataDisposable = terminal.onData((data) => {
          if (socket?.readyState !== WebSocket.OPEN) return;
          socket.send(new TextEncoder().encode(data));
        });

        // Coalesce resize bursts so we only fit once the gesture settles.
        resizeObserver = new ResizeObserver(() => {
          if (resizeTimer) clearTimeout(resizeTimer);
          resizeTimer = setTimeout(() => {
            resizeTimer = null;
            try {
              fit.fit();
            } catch {
              /* container not yet sized */
            }
            if (socket) sendResize(socket, terminal);
          }, 120);
        });
        resizeObserver.observe(container);
      });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf1);
      if (initialPromptTimer) clearTimeout(initialPromptTimer);
      if (resizeTimer) clearTimeout(resizeTimer);
      if (flushTimer !== undefined) clearTimeout(flushTimer);
      resizeObserver?.disconnect();
      dataDisposable?.dispose();
      if (
        socket &&
        (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)
      ) {
        socket.close();
      }
      webgl?.dispose();
      terminal.dispose();
      terminalRef.current = null;
    };
    // themeMode is intentionally excluded — flipping the theme retints via the effect
    // below without tearing down the pty.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, tool, initialPrompt]);

  // Retint the live terminal when the theme mode changes, without dropping the buffer
  // or the WebSocket connection.
  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    terminal.options.theme = pickTerminalTheme(themeMode);
  }, [themeMode]);

  return (
    <div className={cn("relative flex h-full min-h-0 flex-col", className)}>
      {state === "unpaired" ? (
        <p className="p-(--studio-panel-gap-sm) text-sm text-muted-foreground">
          {m.studio_pty_card_needs_pairing({}, { locale })}
        </p>
      ) : null}
      <div ref={containerRef} className="studio-pty-card-terminal nodrag nowheel min-h-0 flex-1" />
    </div>
  );
}

function sendResize(socket: WebSocket, terminal: Terminal) {
  if (socket.readyState !== WebSocket.OPEN) return;
  socket.send(
    JSON.stringify({
      type: "resize",
      cols: terminal.cols,
      rows: terminal.rows,
    }),
  );
}

function formatInitialPromptForPty(prompt: string) {
  const normalized = prompt.trimEnd();
  // Agent CLIs such as Codex and Claude run full-screen TUIs. Sending bytes
  // immediately on WebSocket open can land in the shell while the TUI is still
  // starting. Bracketed paste makes the delayed payload arrive as user input
  // instead of a stream of control-sensitive keystrokes.
  return `\x1b[200~${normalized}\x1b[201~\r`;
}
