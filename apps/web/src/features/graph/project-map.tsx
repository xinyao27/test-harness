import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { useMemo } from "react";

import "@xyflow/react/dist/style.css";

import { Badge } from "@/components/ui/badge";
import type { HarnessSnapshot } from "@/data/harness-snapshot";
import { getReviewStateLabel, getRunStatusLabel } from "@/features/status/status-labels";
import { useI18n, type AppLocale } from "@/lib/i18n";
import { localizeText } from "@/lib/localized-text";
import { cn } from "@/lib/utils";
import { useWorkbenchStore } from "@/stores/workbench-store";

type WorkbenchNodeData = {
  label: string;
  caption: string;
  kind: "module" | "promise" | "evidence";
  status?: string;
};

type WorkbenchNode = Node<WorkbenchNodeData>;

const nodeTypes = {
  workbench: WorkbenchGraphNode,
};

export function ProjectMap({ snapshot }: { snapshot: HarnessSnapshot }) {
  const setSelectedNodeId = useWorkbenchStore((state) => state.setSelectedNodeId);
  const { locale, m } = useI18n();
  const { nodes, edges } = useMemo(() => buildGraph(snapshot, locale, m), [snapshot, locale, m]);

  return (
    <div className="studio-flow-surface h-full overflow-hidden rounded-lg border shadow-xs">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.24 }}
        minZoom={0.3}
        maxZoom={1.3}
        onNodeClick={(_, node) => setSelectedNodeId(node.id)}
        onPaneClick={() => setSelectedNodeId(null)}
      >
        <Background color="var(--border)" gap={18} size={1} />
        <MiniMap
          pannable
          zoomable
          maskColor="var(--background)"
          nodeColor="var(--muted)"
          nodeStrokeColor="var(--border)"
          nodeStrokeWidth={3}
        />
        <Controls />
      </ReactFlow>
    </div>
  );
}

function WorkbenchGraphNode({ data }: NodeProps<WorkbenchNode>) {
  const { locale, m } = useI18n();
  const tone = {
    module: "border-border bg-card text-card-foreground",
    promise: "border-status-success-border bg-status-success text-status-success-foreground",
    evidence: "border-border bg-muted text-foreground",
  }[data.kind];

  return (
    <div className={cn("min-w-44 rounded-lg border p-3 shadow-xs", tone)}>
      <Handle type="target" position={Position.Left} className="size-2 bg-border" />
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm">{data.label}</div>
        <Badge variant="outline">{getKindLabel(data.kind, locale, m)}</Badge>
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{data.caption}</div>
      {data.status ? <div className="mt-2 text-xs text-muted-foreground">{data.status}</div> : null}
      <Handle type="source" position={Position.Right} className="size-2 bg-border" />
    </div>
  );
}

type MessageModule = ReturnType<typeof useI18n>["m"];

function buildGraph(
  snapshot: HarnessSnapshot,
  locale: AppLocale,
  messages: MessageModule,
): { nodes: WorkbenchNode[]; edges: Edge[] } {
  const moduleNodes: WorkbenchNode[] = snapshot.modules.map((module, index) => ({
    id: `module:${module.id}`,
    type: "workbench",
    position: { x: 0, y: index * 138 },
    data: {
      label: localizeText(module.title, locale),
      caption: messages.modules_cover_count({ count: module.covers.length }, { locale }),
      kind: "module",
    },
  }));

  const visiblePromises = snapshot.promises.slice(0, 6);
  const promiseNodes: WorkbenchNode[] = visiblePromises.map((promise, index) => ({
    id: `promise:${promise.id}`,
    type: "workbench",
    position: { x: 360, y: index * 116 + 28 },
    data: {
      label: localizeText(promise.title, locale),
      caption: promise.priority,
      kind: "promise",
      status: getReviewStateLabel(promise.review.state, locale, messages),
    },
  }));

  const evidenceNodes: WorkbenchNode[] = visiblePromises.slice(0, 4).map((promise, index) => ({
    id: `evidence:${promise.id}`,
    type: "workbench",
    position: { x: 760, y: index * 138 + 58 },
    data: {
      label: promise.observes[0] ?? messages.graph_evidence_fallback({}, { locale }),
      caption: getRunStatusLabel(promise.runStatus, locale, messages),
      kind: "evidence",
    },
  }));

  const ownershipEdges: Edge[] = visiblePromises.map((promise) => ({
    id: `owns:${promise.moduleId}:${promise.id}`,
    source: `module:${promise.moduleId}`,
    target: `promise:${promise.id}`,
    label: messages.graph_edge_owns({}, { locale }),
    markerEnd: { type: MarkerType.ArrowClosed },
    style: { stroke: "var(--studio-edge-stroke)", strokeWidth: 1.5 },
  }));

  const evidenceEdges: Edge[] = visiblePromises.slice(0, 4).map((promise) => ({
    id: `observes:${promise.id}`,
    source: `promise:${promise.id}`,
    target: `evidence:${promise.id}`,
    label: messages.graph_edge_observes({}, { locale }),
    markerEnd: { type: MarkerType.ArrowClosed },
    style: { stroke: "var(--studio-edge-stroke)", strokeDasharray: "5 4", strokeWidth: 1.5 },
  }));

  const relationEdges: Edge[] = snapshot.modules.flatMap((module) =>
    module.relatedModuleIds
      .filter((relatedModuleId) =>
        snapshot.modules.some((candidate) => candidate.id === relatedModuleId),
      )
      .map((relatedModuleId) => ({
        id: `relates:${module.id}:${relatedModuleId}`,
        source: `module:${module.id}`,
        target: `module:${relatedModuleId}`,
        label: messages.graph_edge_related({}, { locale }),
        style: { stroke: "var(--studio-edge-muted-stroke)", strokeWidth: 1, opacity: 0.35 },
      })),
  );

  return {
    nodes: [...moduleNodes, ...promiseNodes, ...evidenceNodes],
    edges: [...ownershipEdges, ...evidenceEdges, ...relationEdges],
  };
}

function getKindLabel(kind: WorkbenchNodeData["kind"], locale: AppLocale, messages: MessageModule) {
  if (kind === "module") return messages.graph_kind_module({}, { locale });
  if (kind === "promise") return messages.graph_kind_promise({}, { locale });
  return messages.graph_kind_evidence({}, { locale });
}
