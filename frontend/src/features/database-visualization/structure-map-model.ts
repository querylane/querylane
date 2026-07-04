import type {
  VisualizationEdge,
  VisualizationNode,
} from "@/features/database-visualization/graph-model";

type StructureConstraintKind =
  | "check"
  | "exclusion"
  | "foreign_key"
  | "primary_key"
  | "unique";

interface StructureMapSchema {
  id: string;
  name: string;
  owner: string;
}

interface StructureMapColumn {
  columnName: string;
  isNullable: boolean;
  isPrimaryKey: boolean;
  isUnique?: boolean | undefined;
  rawType: string;
}

interface StructureMapConstraint {
  columnNames: string[];
  constraintName: string;
  referencedColumnNames: string[];
  referencedTable: string;
  type: StructureConstraintKind;
}

interface StructureMapIndex {
  indexName: string;
  isUnique: boolean;
  keyColumns: string[];
  method: string;
}

interface StructureMapPolicy {
  command: string;
  policyName: string;
  roles: string[];
}

interface StructureMapTrigger {
  enabled: boolean;
  events: string[];
  functionName: string;
  timing: string;
  triggerName: string;
}

interface StructureMapTable {
  columns: StructureMapColumn[];
  constraints: StructureMapConstraint[];
  indexes: StructureMapIndex[];
  policies: StructureMapPolicy[];
  schemaName: string;
  tableName: string;
  triggers: StructureMapTrigger[];
}

interface StructureMapView {
  comment: string;
  owner: string;
  schemaName: string;
  viewName: string;
  viewType: "materialized" | "standard";
}

interface StructureMapModelInput {
  databaseName: string;
  schemas: StructureMapSchema[];
  tables: StructureMapTable[];
  views: StructureMapView[];
}

interface StructureMapSummary {
  foreignKeyCount: number;
  policyCount: number;
  schemaCount: number;
  tableCount: number;
  triggerCount: number;
  viewCount: number;
}

interface StructureMapModel {
  edges: VisualizationEdge[];
  nodes: VisualizationNode[];
  summary: StructureMapSummary;
}

const REFERENCED_TABLE_PATTERN = /\/schemas\/([^/]+)\/tables\/([^/]+)$/;

function tableNodeId(schemaName: string, tableName: string) {
  return `table:${schemaName}.${tableName}`;
}

function viewNodeId(schemaName: string, viewName: string) {
  return `view:${schemaName}.${viewName}`;
}

function columnNodeId(
  schemaName: string,
  tableName: string,
  columnName: string
) {
  return `column:${schemaName}.${tableName}.${columnName}`;
}

function keyNodeId(
  schemaName: string,
  tableName: string,
  constraintName: string
) {
  return `key:${schemaName}.${tableName}.${constraintName}`;
}

function constraintNodeId(
  schemaName: string,
  tableName: string,
  constraintName: string
) {
  return `constraint:${schemaName}.${tableName}.${constraintName}`;
}

function indexNodeId(schemaName: string, tableName: string, indexName: string) {
  return `index:${schemaName}.${tableName}.${indexName}`;
}

function policyNodeId(
  schemaName: string,
  tableName: string,
  policyName: string
) {
  return `policy:${schemaName}.${tableName}.${policyName}`;
}

function triggerNodeId(
  schemaName: string,
  tableName: string,
  triggerName: string
) {
  return `trigger:${schemaName}.${tableName}.${triggerName}`;
}

function schemaNodeId(schemaName: string) {
  return `schema:${schemaName}`;
}

function columnBadges(column: StructureMapColumn): string[] {
  const badges = ["COLUMN"];
  if (column.isPrimaryKey) {
    badges.push("PK");
  }
  if (column.isUnique) {
    badges.push("UNIQUE");
  }
  if (!(column.isNullable || column.isPrimaryKey)) {
    badges.push("NOT NULL");
  }
  return badges;
}

function constraintTypeLabel(type: StructureConstraintKind): string {
  return type.toUpperCase().replaceAll("_", " ");
}

function keyConstraint(type: StructureConstraintKind): boolean {
  return type === "primary_key" || type === "unique" || type === "foreign_key";
}

function viewBadge(view: StructureMapView): string {
  return view.viewType === "materialized" ? "MATERIALIZED VIEW" : "VIEW";
}

function referencedTableIdentity(
  resourceName: string
): { schemaName: string; tableName: string } | null {
  const match = REFERENCED_TABLE_PATTERN.exec(resourceName);
  if (!match) {
    return null;
  }
  const [, schemaName, tableName] = match;
  if (!(schemaName && tableName)) {
    return null;
  }
  return { schemaName, tableName };
}

function buildForeignKeyRelationshipLabel(
  constraint: StructureMapConstraint
): string {
  const source = constraint.columnNames.join(", ");
  const target = constraint.referencedColumnNames.join(", ");
  if (source && target) {
    return `references ${source} → ${target}`;
  }
  return "references";
}

function databaseNode(input: StructureMapModelInput): VisualizationNode {
  return {
    data: {
      badges: ["DATABASE"],
      lines: [
        `${input.schemas.length} schemas`,
        `${input.tables.length} tables`,
        `${input.views.length} views`,
      ],
      title: input.databaseName,
    },
    id: `database:${input.databaseName}`,
    kind: "database",
  };
}

function appendViewNodes(
  views: StructureMapView[],
  nodes: VisualizationNode[],
  edges: VisualizationEdge[]
) {
  for (const view of views) {
    const id = viewNodeId(view.schemaName, view.viewName);
    nodes.push({
      data: {
        badges: [viewBadge(view)],
        lines: [],
        navigation: {
          category: "views",
          name: view.viewName,
          schema: view.schemaName,
          to: "explorer",
        },
        subtitle: view.schemaName,
        title: view.viewName,
      },
      id,
      kind: "view",
    });
    edges.push({
      description: `View ${view.viewName} in ${view.schemaName}`,
      id: `${schemaNodeId(view.schemaName)}->${id}`,
      source: schemaNodeId(view.schemaName),
      target: id,
    });
  }
}

function appendSchemaNodes(
  input: StructureMapModelInput,
  nodes: VisualizationNode[],
  edges: VisualizationEdge[]
) {
  for (const schema of input.schemas) {
    const schemaId = schemaNodeId(schema.name);
    nodes.push({
      data: {
        badges: ["SCHEMA"],
        lines: [],
        navigation: { schema: schema.name, to: "explorer" },
        title: schema.name,
      },
      id: schemaId,
      kind: "schema",
    });
    edges.push({
      description: `Schema ${schema.name} belongs to ${input.databaseName}`,
      id: `database:${input.databaseName}->${schemaId}`,
      label: "contains",
      source: `database:${input.databaseName}`,
      target: schemaId,
    });
  }
}

function appendTableNodes(
  tables: StructureMapTable[],
  nodes: VisualizationNode[],
  edges: VisualizationEdge[],
  tableIds: Set<string>
) {
  for (const table of tables) {
    const id = tableNodeId(table.schemaName, table.tableName);
    tableIds.add(id);
    nodes.push({
      data: {
        badges: ["TABLE"],
        lines: [],
        navigation: {
          category: "tables",
          name: table.tableName,
          schema: table.schemaName,
          to: "explorer",
        },
        subtitle: table.schemaName,
        title: table.tableName,
      },
      id,
      kind: "table",
    });
    edges.push({
      description: `Table ${table.tableName} in ${table.schemaName}`,
      id: `${schemaNodeId(table.schemaName)}->${id}`,
      source: schemaNodeId(table.schemaName),
      target: id,
    });
  }
}

function appendColumnNodes(
  table: StructureMapTable,
  nodes: VisualizationNode[],
  edges: VisualizationEdge[]
) {
  const tableId = tableNodeId(table.schemaName, table.tableName);
  for (const column of table.columns) {
    const id = columnNodeId(
      table.schemaName,
      table.tableName,
      column.columnName
    );
    nodes.push({
      data: {
        badges: columnBadges(column),
        lines: column.rawType ? [column.rawType] : [],
        subtitle: table.tableName,
        title: column.columnName,
      },
      id,
      kind: "column",
    });
    edges.push({
      description: `Column ${column.columnName} on ${table.tableName}`,
      id: `${tableId}->${id}`,
      source: tableId,
      target: id,
    });
  }
}

function appendMissingReferencedTable(
  referenced: { schemaName: string; tableName: string },
  nodes: VisualizationNode[],
  tableIds: Set<string>
): string {
  const target = tableNodeId(referenced.schemaName, referenced.tableName);
  if (tableIds.has(target)) {
    return target;
  }
  nodes.push({
    data: {
      badges: ["REFERENCED"],
      lines: ["Referenced table not loaded"],
      navigation: {
        category: "tables",
        name: referenced.tableName,
        schema: referenced.schemaName,
        to: "explorer",
      },
      subtitle: referenced.schemaName,
      title: referenced.tableName,
    },
    id: target,
    kind: "table",
  });
  tableIds.add(target);
  return target;
}

function appendForeignKeyReferenceEdge({
  constraint,
  edges,
  id,
  nodes,
  tableIds,
}: {
  constraint: StructureMapConstraint;
  edges: VisualizationEdge[];
  id: string;
  nodes: VisualizationNode[];
  tableIds: Set<string>;
}) {
  if (constraint.type !== "foreign_key") {
    return;
  }
  const referenced = referencedTableIdentity(constraint.referencedTable);
  if (!referenced) {
    return;
  }
  const target = appendMissingReferencedTable(referenced, nodes, tableIds);
  edges.push({
    description: buildForeignKeyRelationshipLabel(constraint),
    id: `${id}->${target}`,
    label: buildForeignKeyRelationshipLabel(constraint),
    source: id,
    target,
  });
}

function appendKeyOrConstraintNode({
  constraint,
  edges,
  nodes,
  table,
  tableIds,
}: {
  constraint: StructureMapConstraint;
  edges: VisualizationEdge[];
  nodes: VisualizationNode[];
  table: StructureMapTable;
  tableIds: Set<string>;
}) {
  const isKey = keyConstraint(constraint.type);
  const id = isKey
    ? keyNodeId(table.schemaName, table.tableName, constraint.constraintName)
    : constraintNodeId(
        table.schemaName,
        table.tableName,
        constraint.constraintName
      );
  const tableId = tableNodeId(table.schemaName, table.tableName);
  const label = constraintTypeLabel(constraint.type);
  nodes.push({
    data: {
      badges: [label],
      lines: constraint.columnNames,
      subtitle: table.tableName,
      title: constraint.constraintName || label,
    },
    id,
    kind: isKey ? "key" : "constraint",
  });
  edges.push({
    description: `${label} ${constraint.constraintName} on ${table.tableName}`,
    id: `${tableId}->${id}`,
    source: tableId,
    target: id,
  });
  appendForeignKeyReferenceEdge({ constraint, edges, id, nodes, tableIds });
}

function appendKeyAndConstraintNodes(
  tables: StructureMapTable[],
  nodes: VisualizationNode[],
  edges: VisualizationEdge[],
  tableIds: Set<string>
) {
  for (const table of tables) {
    for (const constraint of table.constraints) {
      appendKeyOrConstraintNode({
        constraint,
        edges,
        nodes,
        table,
        tableIds,
      });
    }
  }
}

function appendIndexNodes(
  table: StructureMapTable,
  nodes: VisualizationNode[],
  edges: VisualizationEdge[]
) {
  const tableId = tableNodeId(table.schemaName, table.tableName);
  for (const index of table.indexes) {
    const id = indexNodeId(table.schemaName, table.tableName, index.indexName);
    nodes.push({
      data: {
        badges: [index.isUnique ? "UNIQUE INDEX" : "INDEX"],
        lines: [index.method, ...index.keyColumns].filter(Boolean),
        subtitle: table.tableName,
        title: index.indexName,
      },
      id,
      kind: "index",
    });
    edges.push({
      description: `Index ${index.indexName} on ${table.tableName}`,
      id: `${tableId}->${id}`,
      source: tableId,
      target: id,
    });
  }
}

function appendPolicyNodes(
  table: StructureMapTable,
  nodes: VisualizationNode[],
  edges: VisualizationEdge[]
) {
  const tableId = tableNodeId(table.schemaName, table.tableName);
  for (const policy of table.policies) {
    const id = policyNodeId(
      table.schemaName,
      table.tableName,
      policy.policyName
    );
    nodes.push({
      data: {
        badges: ["POLICY"],
        lines: [policy.command, ...policy.roles].filter(Boolean),
        subtitle: table.tableName,
        title: policy.policyName,
      },
      id,
      kind: "policy",
    });
    edges.push({
      description: `Policy ${policy.policyName} on ${table.tableName}`,
      id: `${tableId}->${id}`,
      source: tableId,
      target: id,
    });
  }
}

function appendTriggerNodes(
  table: StructureMapTable,
  nodes: VisualizationNode[],
  edges: VisualizationEdge[]
) {
  const tableId = tableNodeId(table.schemaName, table.tableName);
  for (const trigger of table.triggers) {
    const id = triggerNodeId(
      table.schemaName,
      table.tableName,
      trigger.triggerName
    );
    const triggerEvent = [trigger.timing, trigger.events.join(", ")]
      .filter(Boolean)
      .join(" ");
    nodes.push({
      data: {
        badges: [trigger.enabled ? "TRIGGER" : "DISABLED TRIGGER"],
        lines: [triggerEvent, trigger.functionName].filter(Boolean),
        subtitle: table.tableName,
        title: trigger.triggerName,
      },
      id,
      kind: "trigger",
    });
    edges.push({
      description: `Trigger ${trigger.triggerName} on ${table.tableName}`,
      id: `${tableId}->${id}`,
      source: tableId,
      target: id,
    });
  }
}

function appendTableResourceNodes(
  tables: StructureMapTable[],
  nodes: VisualizationNode[],
  edges: VisualizationEdge[],
  tableIds: Set<string>
) {
  for (const table of tables) {
    appendColumnNodes(table, nodes, edges);
    appendIndexNodes(table, nodes, edges);
    appendPolicyNodes(table, nodes, edges);
    appendTriggerNodes(table, nodes, edges);
  }
  appendKeyAndConstraintNodes(tables, nodes, edges, tableIds);
}

function buildSummary(input: StructureMapModelInput): StructureMapSummary {
  return {
    foreignKeyCount: input.tables.reduce(
      (count, table) =>
        count +
        table.constraints.filter(
          (constraint) => constraint.type === "foreign_key"
        ).length,
      0
    ),
    policyCount: input.tables.reduce(
      (count, table) => count + table.policies.length,
      0
    ),
    schemaCount: input.schemas.length,
    tableCount: input.tables.length,
    triggerCount: input.tables.reduce(
      (count, table) => count + table.triggers.length,
      0
    ),
    viewCount: input.views.length,
  };
}

function buildStructureMapModel(
  input: StructureMapModelInput
): StructureMapModel {
  const nodes: VisualizationNode[] = [databaseNode(input)];
  const edges: VisualizationEdge[] = [];
  const tableIds = new Set<string>();

  appendSchemaNodes(input, nodes, edges);
  appendTableNodes(input.tables, nodes, edges, tableIds);
  appendTableResourceNodes(input.tables, nodes, edges, tableIds);
  appendViewNodes(input.views, nodes, edges);

  return { edges, nodes, summary: buildSummary(input) };
}

export type {
  StructureConstraintKind,
  StructureMapColumn,
  StructureMapConstraint,
  StructureMapIndex,
  StructureMapModel,
  StructureMapModelInput,
  StructureMapPolicy,
  StructureMapSchema,
  StructureMapSummary,
  StructureMapTable,
  StructureMapTrigger,
  StructureMapView,
};
export { buildStructureMapModel };
