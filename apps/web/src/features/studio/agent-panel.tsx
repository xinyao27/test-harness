import { RiCloseLine, RiTerminalBoxLine } from "@remixicon/react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";

import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getAgentPtyWebSocketUrl } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type ConnectionState = "idle" | "connecting" | "connected" | "closed" | "unpaired";

/**
 * AgentPanel — an inline terminal that runs the configured agent CLI inside
 * the daemon's pty, so the user can drive review + run + implement loops
 * without leaving Studio. Implements harness.web_dashboard.agent_panel_runs_inline_terminal.
 */
export function AgentPanel({ onClose }: { onClose: () => void }) {
  const { locale, m } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const [state, setState] = useState<ConnectionState>("idle");

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const url = getAgentPtyWebSocketUrl();
    if (!url) {
      setState("unpaired");
      return;
    }

    const terminal = new Terminal({
      cursorBlink: true,
      fontFamily: '"Geist Mono Variable", ui-monospace, monospace',
      fontSize: 13,
      theme: { background: "#0a0a0a", foreground: "#e5e5e5" },
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(container);
    terminalRef.current = terminal;
    fitRef.current = fit;

    // Wait one animation frame so the container has its real layout size before
    // we compute cols/rows; otherwise the daemon's PTY would spawn at the
    // mounted-but-unlaid-out tiny default and the agent's startup output would
    // be wrapped at the wrong width.
    let socket: WebSocket | null = null;
    let cancelled = false;
    let dataDisposable: { dispose: () => void } | null = null;
    let resizeObserver: ResizeObserver | null = null;

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
      socketRef.current = socket;

      socket.addEventListener("open", () => {
        setState("connected");
        if (socket) sendResize(socket, terminal);
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

      // Terminal → WebSocket (stdin bytes).
      dataDisposable = terminal.onData((data) => {
        if (socket?.readyState !== WebSocket.OPEN) return;
        socket.send(new TextEncoder().encode(data));
      });

      // Re-fit + forward resize whenever the panel changes size.
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
      socketRef.current = null;
      terminalRef.current = null;
      fitRef.current = null;
    };
  }, []);

  return (
    <section className="studio-agent-panel" aria-label={m.studio_agent_panel_title({}, { locale })}>
      <header className="studio-agent-panel-header">
        <div className="flex items-center gap-(--studio-panel-gap-sm)">
          <RiTerminalBoxLine className="size-4 shrink-0 text-muted-foreground" />
          <div className="text-sm font-medium">{m.studio_agent_panel_title({}, { locale })}</div>
          <span
            className={cn(
              "ml-(--studio-panel-gap-sm) inline-flex items-center gap-1 text-xs",
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
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={m.action_collapse_panel({}, { locale })}
                onClick={onClose}
              >
                <RiCloseLine />
              </Button>
            }
          >
            {m.action_collapse_panel({}, { locale })}
          </TooltipTrigger>
          <TooltipContent side="left">{m.action_collapse_panel({}, { locale })}</TooltipContent>
        </Tooltip>
      </header>
      <div className="studio-agent-panel-body">
        {state === "unpaired" ? (
          <p className="text-sm text-muted-foreground">
            {m.studio_agent_panel_needs_pairing({}, { locale })}
          </p>
        ) : null}
        <div ref={containerRef} className="studio-agent-panel-terminal" />
      </div>
    </section>
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
      return m.studio_agent_panel_state_connecting({}, { locale });
    case "connected":
      return m.studio_agent_panel_state_connected({}, { locale });
    case "closed":
      return m.studio_agent_panel_state_closed({}, { locale });
    case "unpaired":
      return m.studio_agent_panel_state_unpaired({}, { locale });
    default:
      return "";
  }
}
