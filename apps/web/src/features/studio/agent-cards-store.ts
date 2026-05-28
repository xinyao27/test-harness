import { create } from "zustand";

import type { AgentTool } from "@/lib/api";

/**
 * One pty card on the Studio canvas. Two kinds:
 * - `terminal`: the daemon spawns the user's shell.
 * - `agent`: the daemon spawns the agent CLI picked by `tool` (Claude Code /
 *   Codex / Cursor CLI).
 *
 * `promiseId` is set when the card was spawned via "Hand to Agent" on a
 * promise's review panel; the canvas then renders an edge from the card to
 * that promise so a reviewer can see at a glance who is working on what.
 */
export type PtyCardKind = "terminal" | "agent";

export interface PtyCard {
  id: string;
  kind: PtyCardKind;
  /**
   * When `kind === "agent"`, picks which CLI the daemon should launch. Null
   * (and ignored) for `kind === "terminal"`, which always opens the user's
   * shell.
   */
  tool: AgentTool | null;
  /** Null for cards spawned from the toolbar; set when spawned from a promise review. */
  promiseId: string | null;
  /** Canvas position; can be updated when the user drags the card. */
  position: { x: number; y: number };
  /** Initial prompt to send into the pty's stdin once the WebSocket is open. */
  initialPrompt: string | null;
  createdAt: number;
}

interface AgentCardsState {
  cards: PtyCard[];
  addCard: (input: {
    kind: PtyCardKind;
    /** Required for `kind: "agent"`; ignored otherwise. */
    tool?: AgentTool;
    promiseId?: string | null;
    initialPrompt?: string | null;
  }) => PtyCard;
  removeCard: (id: string) => void;
  updateCardPosition: (id: string, position: { x: number; y: number }) => void;
}

/**
 * Where new cards spawn — comfortably to the right of the promise column,
 * with enough breathing room that the dashed "正在处理" link can curve out
 * of the promise's right edge without the card visually overlapping it.
 *
 * Promise nodes sit at x=960 with width ~264 (`--studio-node-width` 16.5rem),
 * ending around x=1224; the gap below puts the card at least 100px clear.
 */
const SPAWN_BASE_X = 1360;
const SPAWN_BASE_Y = 0;
const SPAWN_STEP_Y = 360;

function nextId(): string {
  // Crypto random for stable, debuggable ids that the React Flow node + the
  // canvas edge can both reference.
  if (typeof globalThis.crypto !== "undefined" && "randomUUID" in globalThis.crypto) {
    return globalThis.crypto.randomUUID();
  }
  return `pty-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useAgentCardsStore = create<AgentCardsState>((set) => ({
  cards: [],
  addCard: ({ kind, tool, promiseId = null, initialPrompt = null }) => {
    // `kind="terminal"` ignores the tool — the daemon always opens the shell.
    // For `kind="agent"`, default to Claude when the caller doesn't pick one
    // so legacy entry points (currently none after the picker refactor, but
    // a safe fallback) still resolve to a runnable CLI.
    const resolvedTool: AgentTool | null = kind === "agent" ? (tool ?? "claude") : null;
    const card: PtyCard = {
      id: nextId(),
      kind,
      tool: resolvedTool,
      promiseId,
      initialPrompt,
      createdAt: Date.now(),
      position: { x: 0, y: 0 },
    };
    set((state) => {
      const index = state.cards.length;
      card.position = {
        x: SPAWN_BASE_X,
        y: SPAWN_BASE_Y + index * SPAWN_STEP_Y,
      };
      return { cards: [...state.cards, card] };
    });
    return card;
  },
  removeCard: (id) => set((state) => ({ cards: state.cards.filter((card) => card.id !== id) })),
  updateCardPosition: (id, position) =>
    set((state) => ({
      cards: state.cards.map((card) => (card.id === id ? { ...card, position } : card)),
    })),
}));
