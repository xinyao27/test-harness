import { create } from "zustand";

interface WorkbenchStore {
  selectedNodeId: string | null;
  setSelectedNodeId: (nodeId: string | null) => void;
  relationshipDepth: 1 | 2;
  setRelationshipDepth: (depth: 1 | 2) => void;
}

export const useWorkbenchStore = create<WorkbenchStore>((set) => ({
  selectedNodeId: null,
  setSelectedNodeId: (nodeId) => set({ selectedNodeId: nodeId }),
  relationshipDepth: 1,
  setRelationshipDepth: (depth) => set({ relationshipDepth: depth }),
}));
