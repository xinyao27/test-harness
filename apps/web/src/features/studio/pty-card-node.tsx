import { RiCloseLine, RiRobot2Line, RiTerminalBoxLine } from "@remixicon/react";
import { FitAddon } from "@xterm/addon-fit";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal } from "@xterm/xterm";

import "@xterm/xterm/css/xterm.css";
import { Handle, NodeResizer, Position, type NodeProps } from "@xyflow/react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { useAgentCardsStore, type PtyCardKind } from "@/features/studio/agent-cards-store";
import { pickTerminalTheme } from "@/features/studio/terminal-theme";
import { getAgentPtyWebSocketUrl, type AgentTool } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

type ConnectionState = "idle" | "connecting" | "connected" | "closed" | "unpaired";

export type PtyCardNodeData = {
  cardId: string;
  kind: PtyCardKind;
  tool: AgentTool | null;
  promiseId: string | null;
  initialPrompt: string | null;
};

/**
 * PtyCardNode — a canvas-level node hosting a live pty session. Two kinds:
 *   - `terminal`: pty runs the user's shell.
 *   - `agent`: pty runs the agent CLI picked by `tool` (Claude Code / Codex /
 *     Cursor CLI). The daemon owns the actual binary mapping; we just pass
 *     the tool name in the WebSocket URL.
 *
 * Implements `harness.web_dashboard.canvas_hosts_terminal_and_agent_cards`.
 *
 * The card body is an xterm.js terminal wired to
 * /api/agent/pty?kind=…&agent=…&token=… on the local daemon. Closing the
 * card removes it from the agent-cards store (which removes the React Flow
 * node from the canvas), which closes the WebSocket, which lets the daemon
 * kill + reap the spawned child process.
 */
export function PtyCardNode({ data, selected }: NodeProps) {
  const cardData = data as PtyCardNodeData;
  const { locale, m } = useI18n();
  const { mode: themeMode } = useTheme();
  const removeCard = useAgentCardsStore((state) => state.removeCard);
  const containerRef = useRef<HTMLDivElement>(null);
  // Hold the live xterm instance so a theme-mode change can update its
  // palette without tearing down the WebSocket / pty session.
  const terminalRef = useRef<Terminal | null>(null);
  const [state, setState] = useState<ConnectionState>("idle");

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const url = getAgentPtyWebSocketUrl(cardData.kind, cardData.tool ?? "claude");
    if (!url) {
      setState("unpaired");
      return;
    }

    const terminal: Terminal = new Terminal({
      cursorBlink: true,
      fontFamily: '"Geist Mono Variable", ui-monospace, monospace',
      fontSize: 12,
      // Two hundred thousand lines is enough for a long `claude` /
      // `codex` session to scroll back through. The default 1000 throws
      // away early agent context the moment output starts flowing.
      scrollback: 200_000,
      // Unicode-11 width-detection comes from the addon below; enabling
      // proposed APIs is the contract that lets us set the active
      // version.
      allowProposedApi: true,
      // Full VS Code-style ANSI palette so agent output (red errors,
      // green diff `+` lines, yellow warnings) renders the same way it
      // would in a native terminal. Background is transparent so the
      // card's own background bleeds through; the card data-kind sets
      // the actual surface color.
      allowTransparency: true,
      theme: pickTerminalTheme(themeMode),
    });
    terminalRef.current = terminal;
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(container);

    // Unicode 11 width-table so CJK / full-width / emoji characters
    // measure into the correct number of cells. Without this, a Codex
    // session that prints Chinese paths or a `claude` session with
    // emoji line-wraps weirdly.
    const unicode11 = new Unicode11Addon();
    terminal.loadAddon(unicode11);
    terminal.unicode.activeVersion = "11";

    // WebGL renderer (the same one VS Code uses) — GPU atlas, dramatically
    // faster scroll + bulk-write throughput than the default DOM renderer,
    // which is mandatory once a card is showing a busy `claude` session and
    // multiple cards are running side-by-side. If the GPU context is ever
    // lost (laptop sleep, driver reset), we drop the addon and let xterm
    // fall back to DOM rendering — slow but at least still functional.
    let webgl: WebglAddon | null = null;
    try {
      webgl = new WebglAddon();
      webgl.onContextLoss(() => {
        webgl?.dispose();
        webgl = null;
      });
      terminal.loadAddon(webgl);
    } catch {
      // No WebGL available in this browser; stay on the DOM renderer.
      webgl = null;
    }

    let socket: WebSocket | null = null;
    let cancelled = false;
    let dataDisposable: { dispose: () => void } | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;

    // Coalesce rapid inbound pty data into a single `term.write()` per
    // tick — the same 5 ms VS Code's TerminalDataBufferer uses. Without
    // this, a `claude` session that streams 200 short chunks/sec hits
    // the renderer 200 times/sec and produces partial-paint flicker
    // (especially on the WebGL renderer's double-buffered canvas).
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

    // Defer fit + WebSocket open with a double-rAF so the container has
    // its FINAL layout size before we measure — React Flow lays the
    // node wrapper in one frame and applies the inline width/height in
    // the next, so a single rAF can still measure a transitional size
    // and the daemon's PTY would spawn at the wrong cols/rows.
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
          if (cardData.initialPrompt) {
            // Push the initial prompt as stdin bytes so the agent immediately
            // knows what promise it has been handed.
            socket.send(new TextEncoder().encode(cardData.initialPrompt));
          }
        });
        socket.addEventListener("message", (event) => {
          // Buffer rather than calling `terminal.write` directly — the
          // flush timer will run once every 5 ms regardless of how many
          // chunks arrived.
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

        // ResizeObserver fires on every React Flow zoom step, which would
        // otherwise call fit() + send a daemon resize on each frame while
        // the user spins the trackpad. Coalesce them so we only fit once
        // the resize gesture settles.
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
      // Dispose the WebGL addon explicitly so its texture atlas + canvas are
      // released before the terminal is disposed (xterm.js dispose order
      // matters for the GPU context).
      webgl?.dispose();
      terminal.dispose();
      terminalRef.current = null;
    };
    // We intentionally do NOT include `themeMode` here — flipping the
    // theme should retint the existing card, not tear down the pty.
    // The companion effect below applies live `theme` updates without
    // remounting xterm.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardData.kind, cardData.tool, cardData.initialPrompt]);

  // Retint the live terminal when the studio's theme mode changes. xterm
  // recomputes the palette on the next render without dropping the buffer
  // or the WebSocket connection.
  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    terminal.options.theme = pickTerminalTheme(themeMode);
  }, [themeMode]);

  const Icon = cardData.kind === "agent" ? RiRobot2Line : RiTerminalBoxLine;
  // Title surfaces which CLI the card is actually running — "Claude Code" /
  // "Codex" / "Cursor CLI" — so a reviewer with three cards open can tell
  // them apart at a glance. Terminal cards just say "Terminal".
  const title =
    cardData.kind === "agent"
      ? agentToolLabel(cardData.tool ?? "claude", locale, m)
      : m.studio_pty_card_terminal_title({}, { locale });

  return (
    <div className="studio-pty-card" data-kind={cardData.kind}>
      {/* Corner + edge handles for resizing. xterm.js's ResizeObserver
          inside the body picks up the new size and re-fits the terminal
          (cols/rows). Live dimension changes are forwarded into the
          store by the page's `onNodesChange` handler — no `onResizeEnd`
          needed here. Following the React Flow `DefaultResizer` example,
          the controls only appear when the node is selected, so an idle
          card doesn't show 8 grab dots in its corners. */}
      <NodeResizer isVisible={!!selected} minWidth={320} minHeight={200} />
      {/* Target handle on the LEFT — the edge points FROM the originating
          promise's right side INTO this card, so the line flows out of the
          architecture column into the agent rather than cutting back across
          the promise itself. */}
      <Handle id="link" type="target" position={Position.Left} className="opacity-0" />
      <header className="studio-pty-card-header studio-pty-card-drag-handle">
        <div className="flex min-w-0 items-center gap-(--studio-panel-gap-sm)">
          <Icon className="size-4 shrink-0 text-muted-foreground" />
          <div className="truncate text-sm font-medium">{title}</div>
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1 text-xs",
              state === "connected" ? "text-status-success-foreground" : "text-muted-foreground",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "size-2 rounded-full",
                state === "connected"
                  ? "bg-success"
                  : state === "connecting"
                    ? "bg-warning"
                    : "bg-muted-foreground",
              )}
            />
            {connectionLabel(state, locale, m)}
          </span>
        </div>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          aria-label={m.studio_pty_card_close({}, { locale })}
          onClick={() => removeCard(cardData.cardId)}
          /* `nodrag` keeps React Flow from interpreting the click as a
             drag handle activation — the `.studio-pty-card-drag-handle`
             on the header otherwise covers this button. */
          className="nodrag"
        >
          <RiCloseLine />
        </Button>
      </header>
      <div className="studio-pty-card-body">
        {state === "unpaired" ? (
          <p className="p-(--studio-panel-gap-sm) text-sm text-muted-foreground">
            {m.studio_pty_card_needs_pairing({}, { locale })}
          </p>
        ) : null}
        <div ref={containerRef} className="studio-pty-card-terminal nodrag nowheel" />
      </div>
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

function connectionLabel(
  state: ConnectionState,
  locale: ReturnType<typeof useI18n>["locale"],
  m: ReturnType<typeof useI18n>["m"],
): string {
  switch (state) {
    case "connecting":
      return m.studio_pty_card_state_connecting({}, { locale });
    case "connected":
      return m.studio_pty_card_state_connected({}, { locale });
    case "closed":
      return m.studio_pty_card_state_closed({}, { locale });
    case "unpaired":
      return m.studio_pty_card_state_unpaired({}, { locale });
    default:
      return "";
  }
}

/**
 * Public-facing name for an agent CLI. The card header surfaces this so a
 * reviewer with three agent cards open can tell "Claude Code", "Codex", and
 * "Cursor CLI" apart without inspecting the URL or pty output.
 */
export function agentToolLabel(
  tool: AgentTool,
  locale: ReturnType<typeof useI18n>["locale"],
  m: ReturnType<typeof useI18n>["m"],
): string {
  switch (tool) {
    case "claude":
      return m.studio_agent_tool_claude({}, { locale });
    case "codex":
      return m.studio_agent_tool_codex({}, { locale });
    case "cursor":
      return m.studio_agent_tool_cursor({}, { locale });
  }
}
