import { RiCloseLine, RiRobot2Line, RiTerminalBoxLine } from "@remixicon/react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";

import "@xterm/xterm/css/xterm.css";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { useAgentCardsStore, type PtyCardKind } from "@/features/studio/agent-cards-store";
import { getAgentPtyWebSocketUrl } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type ConnectionState = "idle" | "connecting" | "connected" | "closed" | "unpaired";

export type PtyCardNodeData = {
  cardId: string;
  kind: PtyCardKind;
  promiseId: string | null;
  initialPrompt: string | null;
};

/**
 * PtyCardNode — a canvas-level node hosting a live pty session. Two kinds:
 *   - `terminal`: pty runs the user's shell.
 *   - `agent`: pty runs the configured agent CLI (default `claude`).
 *
 * Implements `harness.web_dashboard.canvas_hosts_terminal_and_agent_cards`.
 *
 * The card body is an xterm.js terminal wired to /api/agent/pty?kind=…&token=…
 * on the local daemon. Closing the card removes it from the agent-cards store
 * (which removes the React Flow node from the canvas), which closes the
 * WebSocket, which lets the daemon kill + reap the spawned child process.
 */
export function PtyCardNode({ data }: NodeProps) {
  const cardData = data as PtyCardNodeData;
  const { locale, m } = useI18n();
  const removeCard = useAgentCardsStore((state) => state.removeCard);
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<ConnectionState>("idle");

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const url = getAgentPtyWebSocketUrl(cardData.kind);
    if (!url) {
      setState("unpaired");
      return;
    }

    const terminal = new Terminal({
      cursorBlink: true,
      fontFamily: '"Geist Mono Variable", ui-monospace, monospace',
      fontSize: 12,
      theme: { background: "#0a0a0a", foreground: "#e5e5e5" },
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(container);

    let socket: WebSocket | null = null;
    let cancelled = false;
    let dataDisposable: { dispose: () => void } | null = null;
    let resizeObserver: ResizeObserver | null = null;

    // Defer fit + WebSocket open one frame so the container has its real
    // layout size — otherwise the daemon's PTY would spawn at a tiny default
    // and the agent's startup output would wrap wrong.
    const raf = requestAnimationFrame(() => {
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
        if (typeof event.data === "string") {
          terminal.write(event.data);
        } else if (event.data instanceof ArrayBuffer) {
          terminal.write(new Uint8Array(event.data));
        }
      });
      socket.addEventListener("close", () => setState("closed"));
      socket.addEventListener("error", () => setState("closed"));

      dataDisposable = terminal.onData((data) => {
        if (socket?.readyState !== WebSocket.OPEN) return;
        socket.send(new TextEncoder().encode(data));
      });

      resizeObserver = new ResizeObserver(() => {
        try {
          fit.fit();
        } catch {
          /* container not yet sized */
        }
        if (socket) sendResize(socket, terminal);
      });
      resizeObserver.observe(container);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      resizeObserver?.disconnect();
      dataDisposable?.dispose();
      if (
        socket &&
        (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)
      ) {
        socket.close();
      }
      terminal.dispose();
    };
  }, [cardData.kind, cardData.initialPrompt]);

  const Icon = cardData.kind === "agent" ? RiRobot2Line : RiTerminalBoxLine;
  const title =
    cardData.kind === "agent"
      ? m.studio_pty_card_agent_title({}, { locale })
      : m.studio_pty_card_terminal_title({}, { locale });

  return (
    <div className="studio-pty-card" data-kind={cardData.kind}>
      {/* Handle for the edge connecting this card to its assigned promise. */}
      <Handle id="link" type="source" position={Position.Left} className="opacity-0" />
      <header className="studio-pty-card-header">
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
          size="icon-sm"
          variant="ghost"
          aria-label={m.studio_pty_card_close({}, { locale })}
          onClick={() => removeCard(cardData.cardId)}
          className="studio-panel-icon-control nodrag"
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
