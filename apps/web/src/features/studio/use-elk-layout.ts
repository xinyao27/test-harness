/**
 * elkjs-driven layout for the Studio canvas — adapted directly from the
 * xyflow `elkjs-multiple-handles` example's `useLayoutNodes` hook.
 *
 * The hook waits until React Flow has measured every node (via
 * `useNodesInitialized`), runs `elk.layout()` with the layered algorithm,
 * and then publishes the computed `{ x, y }` positions through a
 * setter. The caller merges those positions into its `nodes` memo so
 * the user-driven pty cards keep their store-owned coordinates while
 * the architecture / promise nodes get auto-arranged.
 *
 * Reference upstream:
 *   https://github.com/xyflow/web/blob/main/apps/example-apps/react/
 *     examples/layout/elkjs-multiple-handles/useLayoutNodes.ts
 */

import { useNodesInitialized, useReactFlow, type Edge, type Node } from "@xyflow/react";
import ELK from "elkjs/lib/elk.bundled.js";
import { useEffect, useRef } from "react";

const elk = new ELK();

// elkjs `layered` algorithm tuned for the Studio's project → modules →
// promises shape. The full option reference lives at
// https://www.eclipse.org/elk/reference/algorithms/org-eclipse-elk-layered.html
const LAYOUT_OPTIONS = {
  "elk.algorithm": "layered",
  "elk.direction": "RIGHT",
  // Gap between adjacent "layers" (columns when direction is RIGHT). Wide
  // enough that the `拥有` / `正在处理` edge labels don't collide with the
  // node bodies on either side.
  "elk.layered.spacing.nodeNodeBetweenLayers": "180",
  // Vertical spacing between siblings within a layer.
  "elk.spacing.nodeNode": "40",
  // SIMPLE keeps siblings on stable rows when the input order is meaningful
  // (it is — we sort promises by review priority before handing them in).
  "elk.layered.nodePlacement.strategy": "SIMPLE",
} as const;

type ElkPosition = { x: number; y: number };

/**
 * Run elkjs on the supplied `(nodes, edges)` and return a Map keyed by node
 * id with the computed positions. Pty cards (`type === "pty"`) and their
 * `pty-link:*` edges are filtered out before handing the graph to ELK —
 * those nodes are user-positioned via the agent-cards store, and we
 * don't want ELK to bias the rest of the layout to be near them.
 */
async function layoutWithElk(nodes: Node[], edges: Edge[]): Promise<Map<string, ElkPosition>> {
  const elkNodes = nodes.filter((node) => node.type !== "pty");
  const elkEdges = edges.filter((edge) => !edge.id.startsWith("pty-link:"));

  const graph = {
    id: "root",
    layoutOptions: LAYOUT_OPTIONS,
    children: elkNodes.map((node) => ({
      id: node.id,
      // Falls back to the node's `width`/`height` when React Flow has
      // measured them, otherwise to a conservative default.
      width: node.measured?.width ?? node.width ?? 264,
      height: node.measured?.height ?? node.height ?? 124,
    })),
    edges: elkEdges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
  };

  const layouted = await elk.layout(graph);

  const positions = new Map<string, ElkPosition>();
  for (const child of layouted.children ?? []) {
    positions.set(child.id, { x: child.x ?? 0, y: child.y ?? 0 });
  }
  return positions;
}

/**
 * Studio-side wrapper. Re-runs ELK whenever `key` changes (typically
 * `selectedModuleId`, since switching modules swaps the visible node
 * set entirely). Publishes the resulting positions through `onLayout`
 * — usually a `useState` setter the page reads when memoizing nodes.
 *
 * The flow is intentionally one-shot per key: ELK runs once, the page
 * snaps to the layout, and subsequent re-renders (zoom, drag a pty
 * card, edit a card's size) don't re-trigger ELK.
 */
export function useStudioElkLayout(opts: {
  /**
   * Re-run ELK whenever this string changes. Pass a key that captures
   * "the set of nodes ELK should care about" — e.g. the selected
   * module id, or a hash of the snapshot revision.
   */
  key: string;
  /** Called once per ELK pass with the new id → position map. */
  onLayout: (positions: Map<string, ElkPosition>) => void;
}) {
  const nodesInitialized = useNodesInitialized();
  const { getNodes, getEdges, fitView } = useReactFlow();
  // Keep the latest callback in a ref so a parent that recreates
  // `onLayout` per render doesn't restart the effect.
  const onLayoutRef = useRef(opts.onLayout);
  onLayoutRef.current = opts.onLayout;

  useEffect(() => {
    if (!nodesInitialized) return;
    let cancelled = false;
    void (async () => {
      const positions = await layoutWithElk(getNodes(), getEdges());
      if (cancelled) return;
      onLayoutRef.current(positions);
      // Tiny delay so React commits the new positions before the
      // viewport animates to the new bounds.
      requestAnimationFrame(() => {
        if (cancelled) return;
        void fitView({ padding: 0.14, duration: 420 });
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [nodesInitialized, opts.key, getNodes, getEdges, fitView]);
}
