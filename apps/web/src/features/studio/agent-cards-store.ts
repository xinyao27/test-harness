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
  /** Canvas size; can be updated when the user drags a resize handle. */
  size: { width: number; height: number };
  /** Initial prompt to send into the pty's stdin once the WebSocket is open. */
  initialPrompt: string | null;
  createdAt: number;
}

interface AgentCardsState {
  cards: PtyCard[];
  /**
   * One-shot focus request: the id of the most recently spawned card,
   * set by `addCard` and meant to be read + cleared by the page so it
   * can pan the camera to centre the newcomer. Stays `null` after the
   * page consumes it.
   */
  pendingFocusId: string | null;
  /** Clear `pendingFocusId` after the page has handled it. */
  consumeFocus: () => void;
  addCard: (input: {
    kind: PtyCardKind;
    /** Required for `kind: "agent"`; ignored otherwise. */
    tool?: AgentTool;
    promiseId?: string | null;
    initialPrompt?: string | null;
    /**
     * Optional explicit spawn position. If omitted, the card lands at the
     * default stack column at `SPAWN_BASE_X`. Use this when spawning from a
     * promise review to anchor the card next to its originating promise.
     */
    position?: { x: number; y: number };
  }) => PtyCard;
  removeCard: (id: string) => void;
  updateCardPosition: (id: string, position: { x: number; y: number }) => void;
  updateCardSize: (id: string, size: { width: number; height: number }) => void;
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
// Default pty card dimensions. The user can drag the corner / edge handles
// to resize at any time; the new size persists in the store so re-renders
// (module switches, promise selection) don't snap back to the default.
const DEFAULT_WIDTH = 480;
const DEFAULT_HEIGHT = 320;

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
  pendingFocusId: null,
  consumeFocus: () => set({ pendingFocusId: null }),
  addCard: ({ kind, tool, promiseId = null, initialPrompt = null, position }) => {
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
      // Placeholder; real position filled in by the setter below so we can
      // see the current card count (for the toolbar-stack fallback).
      position: { x: 0, y: 0 },
      size: { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT },
    };
    set((state) => {
      if (position) {
        // Caller (e.g. "Hand to Agent") provided an anchor — usually a few
        // hundred px to the right of the originating promise. Use it
        // verbatim so the card lands where the user is looking.
        card.position = position;
      } else {
        // Toolbar path: stack new cards down the same column to the right
        // of the architecture region.
        const index = state.cards.length;
        card.position = {
          x: SPAWN_BASE_X,
          y: SPAWN_BASE_Y + index * SPAWN_STEP_Y,
        };
      }
      // Mark the new card as the focus request so the canvas can
      // centre on it. The page's pan effect picks this up, pans,
      // and clears via `consumeFocus`.
      return { cards: [...state.cards, card], pendingFocusId: `pty:${card.id}` };
    });
    return card;
  },
  removeCard: (id) => set((state) => ({ cards: state.cards.filter((card) => card.id !== id) })),
  updateCardPosition: (id, position) =>
    set((state) => ({
      cards: state.cards.map((card) => (card.id === id ? { ...card, position } : card)),
    })),
  updateCardSize: (id, size) =>
    set((state) => ({
      cards: state.cards.map((card) => (card.id === id ? { ...card, size } : card)),
    })),
}));
