/**
 * Real binding for `harness.web_dashboard.canvas_hosts_terminal_and_agent_cards`.
 *
 * The promise is "two card kinds — terminal (pty + shell) and agent (pty + claude) —
 * live as canvas-level React Flow nodes; a card spawned from a promise review is
 * visibly linked to that promise; multiple cards coexist; closing removes the card."
 *
 * This test pins the Zustand store (`useAgentCardsStore`) — the source of truth
 * for what cards exist on the canvas, which kind each one is, whether it's
 * linked to a promise, what initial prompt the agent receives, and where each
 * card sits. Every user-visible canvas behavior in the promise (toolbar
 * spawn, review handoff, multi-card coexistence, close-removes-card) flows
 * through this store, so a regression here breaks the promise before any pty
 * connection is even attempted.
 *
 * The companion daemon contract — `?kind=terminal|agent` dispatching to shell
 * vs. agent CLI — is verified by its own Rust `scenario_test!` next to the
 * pty handler, since that's where the actual process spawn lives.
 */

import { scenarioTest } from "@test-harness/adapter-vitest";
import { beforeEach, describe, expect } from "vitest";

import { useAgentCardsStore } from "./agent-cards-store";

describe("Studio canvas hosts terminal and agent cards", () => {
  beforeEach(() => {
    // Reset the singleton store between tests so positions / counts don't bleed.
    useAgentCardsStore.setState({ cards: [] });
  });

  scenarioTest(
    "harness.web_dashboard.canvas_hosts_terminal_and_agent_cards",
    "the cards store encodes both kinds, the review-handoff link, multi-card coexistence, deterministic spawn positions, isolated drag updates, and clean teardown",
    () => {
      const store = useAgentCardsStore.getState();

      // -- Contract 1: toolbar paths -------------------------------------------
      // A toolbar "+ Terminal" / "+ Agent" click spawns an unlinked card.
      // The agent picker lets the operator choose Claude Code / Codex / Cursor
      // CLI at spawn time — that choice round-trips into `card.tool` so the
      // pty-card-node can pass it to the daemon as `?agent=…`.
      const terminal = store.addCard({ kind: "terminal" });
      const toolbarAgent = useAgentCardsStore.getState().addCard({ kind: "agent", tool: "codex" });

      expect(terminal.kind, "toolbar terminal kind").toBe("terminal");
      expect(terminal.tool, "terminal kind ignores tool").toBeNull();
      expect(terminal.promiseId, "toolbar terminal not linked").toBeNull();
      expect(terminal.initialPrompt, "toolbar terminal no canned prompt").toBeNull();

      expect(toolbarAgent.kind, "toolbar agent kind").toBe("agent");
      expect(toolbarAgent.tool, "toolbar agent carries picked tool").toBe("codex");
      expect(toolbarAgent.promiseId, "toolbar agent not linked").toBeNull();

      // A bare `kind: "agent"` (no tool) must still resolve to a runnable CLI
      // — Claude is the default so the daemon's `?agent` query has somewhere
      // to dispatch even from a legacy entry point.
      const bareAgent = useAgentCardsStore.getState().addCard({ kind: "agent" });
      expect(bareAgent.tool, "bare agent defaults to claude").toBe("claude");

      // -- Contract 2: review-handoff path -------------------------------------
      // "Hand to Agent" on a promise must produce an agent card carrying:
      //   - the picked tool (so the right CLI launches)
      //   - the promiseId (so the canvas can draw the link edge)
      //   - an initial prompt naming that promise (so the agent knows the target)
      const handoff = useAgentCardsStore.getState().addCard({
        kind: "agent",
        tool: "cursor",
        promiseId: "harness.web_dashboard.canvas_hosts_terminal_and_agent_cards",
        initialPrompt:
          "# Assigned to promise: harness.web_dashboard.canvas_hosts_terminal_and_agent_cards\n",
      });
      expect(handoff.kind, "handoff card is an agent").toBe("agent");
      expect(handoff.tool, "handoff carries picked tool").toBe("cursor");
      expect(handoff.promiseId, "handoff card carries promise id").toBe(
        "harness.web_dashboard.canvas_hosts_terminal_and_agent_cards",
      );
      expect(handoff.initialPrompt, "handoff card has initial prompt").toContain(
        "Assigned to promise:",
      );

      // -- Contract 3: multi-card coexistence + deterministic spawn position ---
      // Each card gets its own slot; positions are distinct so cards don't
      // overlap on the canvas.
      const cards = useAgentCardsStore.getState().cards;
      expect(cards.length, "four cards coexist").toBe(4);
      const xs = new Set(cards.map((card) => card.position.x));
      const ys = new Set(cards.map((card) => card.position.y));
      expect(xs.size, "all cards share the spawn column").toBe(1);
      expect(ys.size, "each card gets a distinct row").toBe(4);

      // Ids are unique so React Flow can key edges to the right node.
      const ids = new Set(cards.map((card) => card.id));
      expect(ids.size, "card ids unique").toBe(4);

      // -- Contract 4: position update mutates exactly one card ----------------
      // The card.id round-trips through React Flow's onNodeDragStop to update
      // only the dragged card's position — siblings stay put.
      const beforeMove = useAgentCardsStore.getState().cards;
      useAgentCardsStore.getState().updateCardPosition(terminal.id, { x: 99, y: 77 });
      const afterMove = useAgentCardsStore.getState().cards;
      const moved = afterMove.find((card) => card.id === terminal.id)!;
      expect(moved.position, "dragged card moves").toEqual({ x: 99, y: 77 });
      for (const sibling of afterMove.filter((card) => card.id !== terminal.id)) {
        const original = beforeMove.find((card) => card.id === sibling.id)!;
        expect(sibling.position, `sibling ${sibling.id} unchanged`).toEqual(original.position);
      }

      // -- Contract 5: close removes the card ----------------------------------
      // Closing the card removes it from the store, which removes the React Flow
      // node (and its edge if any), which closes the WebSocket — the daemon
      // then kills + reaps the spawned child. The store removal is the trigger
      // for that whole chain.
      useAgentCardsStore.getState().removeCard(handoff.id);
      const remaining = useAgentCardsStore.getState().cards;
      expect(remaining.length, "one card removed leaves three").toBe(3);
      expect(
        remaining.find((card) => card.id === handoff.id),
        "removed card gone",
      ).toBeUndefined();
      expect(
        remaining.find((card) => card.id === terminal.id),
        "untouched cards survive",
      ).toBeDefined();

      // The daemon's `?kind=terminal|agent` dispatch — which decides shell vs.
      // agent CLI — is covered by its own Rust scenario_test next to the pty
      // handler. The contract here is intentionally scoped to the store; the
      // store is what bridges every user action (toolbar, review handoff,
      // close, drag) to React Flow nodes and edges.
    },
  );
});
