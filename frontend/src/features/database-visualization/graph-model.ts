export type VisualizationNodeKind =
  | "capability"
  | "column"
  | "constraint"
  | "database"
  | "default"
  | "index"
  | "key"
  | "object"
  | "policy"
  | "public"
  | "role"
  | "schema"
  | "table"
  | "trigger"
  | "view";

export interface VisualizationNavigation {
  category?: "tables" | "views" | undefined;
  name?: string | undefined;
  roleId?: string | undefined;
  schema?: string | undefined;
  to: "explorer" | "role";
}

export interface VisualizationNodeData {
  badges: string[];
  lines: string[];
  navigation?: VisualizationNavigation | undefined;
  subtitle?: string | undefined;
  title: string;
}

export interface VisualizationNode {
  data: VisualizationNodeData;
  id: string;
  kind: VisualizationNodeKind;
}

export interface VisualizationEdge {
  description?: string | undefined;
  id: string;
  label?: string | undefined;
  source: string;
  target: string;
}
