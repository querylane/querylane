import { create } from "zustand";

type VisualizationDetailScope = "all" | "selected-schema";
type VisualizationDirection = "LR" | "TB";

interface DatabaseVisualizationState {
  databaseSelectedNodeId: string | null;
  detailScope: VisualizationDetailScope;
  direction: VisualizationDirection;
  roleSelectedNodeId: string | null;
  setDatabaseSelectedNodeId: (nodeId: string | null) => void;
  setDetailScope: (scope: VisualizationDetailScope) => void;
  setDirection: (direction: VisualizationDirection) => void;
  setRoleSelectedNodeId: (nodeId: string | null) => void;
}

const useDatabaseVisualizationStore = create<DatabaseVisualizationState>()(
  (set) => ({
    databaseSelectedNodeId: null,
    detailScope: "selected-schema",
    direction: "LR",
    roleSelectedNodeId: null,
    setDatabaseSelectedNodeId: (databaseSelectedNodeId) =>
      set({ databaseSelectedNodeId }),
    setDetailScope: (detailScope) => set({ detailScope }),
    setDirection: (direction) => set({ direction }),
    setRoleSelectedNodeId: (roleSelectedNodeId) => set({ roleSelectedNodeId }),
  })
);

export type { VisualizationDetailScope, VisualizationDirection };
export { useDatabaseVisualizationStore };
