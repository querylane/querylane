import type { SchemaSummary } from "@/features/data-explorer/data-explorer-model";
import { formatRows } from "@/features/data-explorer/format-rows";
import {
  normalizeEstimatedRowCount,
  parseResourceLeafId,
  parseTableQualifiedName,
} from "@/lib/console-resources";
import type {
  Column,
  Table,
  TableConstraint,
} from "@/protogen/querylane/console/v1alpha1/table_pb";
import { ConstraintType } from "@/protogen/querylane/console/v1alpha1/table_pb";
import type { View } from "@/protogen/querylane/console/v1alpha1/view_pb";

const NODE_WIDTH = 232;
const VIEW_NODE_WIDTH = 232;
const VIEW_NODE_HEIGHT = 82;
const ROW_HEIGHT = 23;
const HEADER_HEIGHT = 34;
const NODE_FOOTER_HEIGHT = 6;
const GRAPH_COLUMN_GAP_X = 380;
const NODE_GAP_Y = 42;
const START_X = 56;
const START_Y = 116;
const HULL_PADDING_X = 24;
const HULL_PADDING_Y = 40;
const WORLD_MIN_WIDTH = 980;
const WORLD_MIN_HEIGHT = 620;
const MAX_VISIBLE_COLUMNS = 8;
const MIN_SCHEMA_HULL_CONTENT_HEIGHT = 120;
const SCHEMA_ROW_GAP_Y = 76;
const EDGE_MIN_CONTROL_OFFSET = 72;
const TYPE_MODIFIER_PATTERN = /\(.+\)/;

const SCHEMA_TONES = [
  "chart-1",
  "success",
  "chart-4",
  "chart-2",
  "chart-5",
] as const;

type SchemaMapTone = (typeof SCHEMA_TONES)[number];

interface SchemaMapSchemaOption {
  count: number;
  label: string;
  value: string;
}

interface SchemaMapColumn {
  isForeignKey: boolean;
  isPrimaryKey: boolean;
  name: string;
  type: string;
}

interface SchemaMapNode {
  columns: SchemaMapColumn[];
  columnsLoaded: boolean;
  height: number;
  id: string;
  kind: "table";
  name: string;
  rowLabel: string;
  schemaName: string;
  tone: SchemaMapTone;
  truncatedColumnCount: number;
  x: number;
  y: number;
}

interface SchemaMapViewNode {
  definitionLabel: string;
  height: number;
  id: string;
  kind: "view";
  name: string;
  schemaName: string;
  tone: SchemaMapTone;
  x: number;
  y: number;
}

interface SchemaMapEdge {
  d: string;
  fromLabel: string;
  id: string;
  source: string;
  target: string;
  toLabel: string;
  tone: SchemaMapTone;
}

interface SchemaMapHull {
  height: number;
  label: string;
  tone: SchemaMapTone;
  width: number;
  x: number;
  y: number;
}

interface SchemaMapModel {
  edges: SchemaMapEdge[];
  hulls: SchemaMapHull[];
  nodes: SchemaMapNode[];
  schemaOptions: SchemaMapSchemaOption[];
  stats: string;
  viewBox: string;
  viewNodes: SchemaMapViewNode[];
  worldHeight: number;
  worldWidth: number;
}

interface SchemaMapFilter {
  query: string;
  schemaName: string;
}

interface BuildSchemaMapModelInput {
  columnsByTable: Record<string, Column[]>;
  constraintsByTable: Record<string, TableConstraint[]>;
  filter: SchemaMapFilter;
  schemas: SchemaSummary[];
  tables: Table[];
  views: View[];
}

interface SelectSchemaMapMetadataTableNamesInput {
  limit: number;
  query: string;
  schemaNames: string[];
  selectedTableName: string | null;
  tables: Table[];
}

type TableInfo = ReturnType<typeof tableInfo>;
type ViewInfo = ReturnType<typeof viewInfo>;

interface SchemaLayoutResult {
  contentHeight: number;
  contentWidth: number;
  hull: SchemaMapHull;
  nodes: SchemaMapNode[];
  viewNodes: SchemaMapViewNode[];
}

function buildSchemaMapModel({
  columnsByTable,
  constraintsByTable,
  filter,
  schemas,
  tables,
  views,
}: BuildSchemaMapModelInput): SchemaMapModel {
  const schemaOrder = buildSchemaOrder(schemas, tables, views);
  const schemaTone = new Map(
    schemaOrder.map((schemaName, index) => [schemaName, schemaToneAt(index)])
  );
  const tableInfos = tables.map((table) =>
    tableInfo(
      table,
      columnsByTable[table.name] ?? [],
      constraintsByTable,
      Object.hasOwn(columnsByTable, table.name)
    )
  );
  const viewInfos = views.map(viewInfo);
  const schemaOptions = buildSchemaOptions(schemaOrder, tableInfos);
  const normalizedQuery = filter.query.trim().toLowerCase();
  const activeSchema =
    filter.schemaName && filter.schemaName !== "All" ? filter.schemaName : "";
  const visibleTables = tableInfos.filter(
    (table) =>
      (!activeSchema || table.schemaName === activeSchema) &&
      matchesTableQuery(table, normalizedQuery)
  );
  const visibleViews = viewInfos.filter(
    (view) =>
      (!activeSchema || view.schemaName === activeSchema) &&
      matchesViewQuery(view, normalizedQuery)
  );
  const layout = layoutNodes({
    constraintsByTable,
    schemaOrder,
    schemaTone,
    tableInfos: visibleTables,
    viewInfos: visibleViews,
  });
  const nodeById = new Map(layout.nodes.map((node) => [node.id, node]));
  const edges = buildEdges({
    constraintsByTable,
    nodeById,
    schemaTone,
    tableInfos: visibleTables,
  });
  const tableWord = layout.nodes.length === 1 ? "table" : "tables";
  const keyWord = edges.length === 1 ? "foreign key" : "foreign keys";

  return {
    edges,
    hulls: layout.hulls,
    nodes: layout.nodes,
    schemaOptions,
    stats: `${layout.nodes.length.toLocaleString()} ${tableWord} · ${edges.length.toLocaleString()} ${keyWord}`,
    viewBox: `0 0 ${layout.worldWidth} ${layout.worldHeight}`,
    viewNodes: layout.viewNodes,
    worldHeight: layout.worldHeight,
    worldWidth: layout.worldWidth,
  };
}

function schemaToneAt(index: number): SchemaMapTone {
  return SCHEMA_TONES[index % SCHEMA_TONES.length] ?? "chart-1";
}

function buildSchemaOrder(
  schemas: SchemaSummary[],
  tables: Table[],
  views: View[]
): string[] {
  const ordered = new Set(schemas.map((schema) => schema.name));
  for (const table of tables) {
    ordered.add(schemaNameForTable(table));
  }
  for (const view of views) {
    ordered.add(viewSchemaName(view));
  }
  return Array.from(ordered);
}

function buildSchemaOptions(
  schemaOrder: string[],
  tableInfos: ReturnType<typeof tableInfo>[]
): SchemaMapSchemaOption[] {
  const counts = new Map(schemaOrder.map((schema) => [schema, 0]));
  for (const table of tableInfos) {
    counts.set(table.schemaName, (counts.get(table.schemaName) ?? 0) + 1);
  }
  return schemaOrder.map((schema) => ({
    count: counts.get(schema) ?? 0,
    label: schema,
    value: schema,
  }));
}

function tableInfo(
  table: Table,
  columns: Column[],
  constraintsByTable: Record<string, TableConstraint[]>,
  columnsLoaded: boolean
) {
  const qualified = tableSafeQualifiedName(table.name);
  const foreignKeyColumns = new Set(
    (constraintsByTable[table.name] ?? [])
      .filter((constraint) => constraint.type === ConstraintType.FOREIGN_KEY)
      .flatMap((constraint) => constraint.columnNames)
  );
  const visibleColumns = columns
    .slice(0, MAX_VISIBLE_COLUMNS)
    .map((column) => ({
      isForeignKey: foreignKeyColumns.has(column.columnName),
      isPrimaryKey: column.isPrimaryKey,
      name: column.columnName,
      type: simplifyType(column.rawType),
    }));
  return {
    columns,
    columnsLoaded,
    displayName: table.displayName || qualified.table,
    id: table.name,
    rowLabel: rowLabel(table.rowCount),
    schemaName: qualified.schema,
    visibleColumns,
  };
}

function viewInfo(view: View) {
  return {
    definitionLabel: view.definition
      ? view.definition.replace(/\s+/g, " ").trim()
      : "View definition",
    displayName: view.displayName || parseResourceLeafId(view.name),
    id: view.name,
    schemaName: viewSchemaName(view),
  };
}

function schemaNameForTable(table: Table): string {
  return tableSafeQualifiedName(table.name).schema;
}

function selectSchemaMapMetadataTableNames({
  limit,
  query,
  schemaNames,
  selectedTableName,
  tables,
}: SelectSchemaMapMetadataTableNamesInput): string[] {
  const selectedSchemas = new Set(schemaNames);
  const normalizedQuery = query.trim().toLowerCase();
  const tableNames: string[] = [];

  for (const table of tables) {
    const qualified = tableSafeQualifiedName(table.name);
    const isSelected = table.name === selectedTableName;
    if (isSelected) {
      tableNames.push(table.name);
      continue;
    }
    if (!selectedSchemas.has(qualified.schema)) {
      continue;
    }
    const displayName = table.displayName || qualified.table;
    const matchesQuery =
      !normalizedQuery ||
      displayName.toLowerCase().includes(normalizedQuery) ||
      qualified.schema.toLowerCase().includes(normalizedQuery);
    if (matchesQuery && tableNames.length < limit) {
      tableNames.push(table.name);
    }
  }

  return tableNames;
}

function viewSchemaName(view: View): string {
  const segments = view.name.split("/");
  const schemaIndex = segments.indexOf("schemas");
  const schemaSegment = segments[schemaIndex + 1];
  if (schemaIndex >= 0 && schemaSegment) {
    return decodeResourceSegment(schemaSegment);
  }
  return "public";
}

function tableSafeQualifiedName(name: string) {
  try {
    return parseTableQualifiedName(name);
  } catch {
    return { schema: "public", table: parseResourceLeafId(name) };
  }
}

function decodeResourceSegment(segment: string): string {
  return segment.replaceAll("%2F", "/").replaceAll("%25", "%");
}

function rowLabel(rowCount: bigint): string {
  const normalized = normalizeEstimatedRowCount(rowCount);
  return normalized > 0 ? formatRows(normalized) : "—";
}

function simplifyType(rawType: string): string {
  return rawType.replace(TYPE_MODIFIER_PATTERN, "");
}

function matchesTableQuery(
  table: ReturnType<typeof tableInfo>,
  normalizedQuery: string
): boolean {
  if (!normalizedQuery) {
    return true;
  }
  return (
    table.displayName.toLowerCase().includes(normalizedQuery) ||
    table.schemaName.toLowerCase().includes(normalizedQuery) ||
    table.columns.some(
      (column) =>
        column.columnName.toLowerCase().includes(normalizedQuery) ||
        column.rawType.toLowerCase().includes(normalizedQuery)
    )
  );
}

function matchesViewQuery(
  view: ReturnType<typeof viewInfo>,
  normalizedQuery: string
): boolean {
  if (!normalizedQuery) {
    return true;
  }
  return (
    view.displayName.toLowerCase().includes(normalizedQuery) ||
    view.schemaName.toLowerCase().includes(normalizedQuery) ||
    view.definitionLabel.toLowerCase().includes(normalizedQuery)
  );
}

function layoutNodes({
  constraintsByTable,
  schemaOrder,
  schemaTone,
  tableInfos,
  viewInfos,
}: {
  constraintsByTable: Record<string, TableConstraint[]>;
  schemaOrder: string[];
  schemaTone: Map<string, SchemaMapTone>;
  tableInfos: TableInfo[];
  viewInfos: ViewInfo[];
}) {
  const { tablesBySchema, viewsBySchema } = groupCatalogBySchema({
    schemaOrder,
    tableInfos,
    viewInfos,
  });
  const nodes: SchemaMapNode[] = [];
  const viewNodes: SchemaMapViewNode[] = [];
  const hulls: SchemaMapHull[] = [];
  let worldWidth = WORLD_MIN_WIDTH;
  let worldHeight = WORLD_MIN_HEIGHT;
  let schemaStartY = START_Y;

  for (const schemaName of schemaOrder) {
    const schemaLayout = layoutSchema({
      constraintsByTable,
      schemaName,
      schemaStartY,
      schemaTables: tablesBySchema.get(schemaName) ?? [],
      schemaViews: viewsBySchema.get(schemaName) ?? [],
      tone: schemaTone.get(schemaName) ?? "chart-1",
    });
    if (!schemaLayout) {
      continue;
    }

    nodes.push(...schemaLayout.nodes);
    viewNodes.push(...schemaLayout.viewNodes);
    hulls.push(schemaLayout.hull);
    worldWidth = Math.max(
      worldWidth,
      START_X + schemaLayout.contentWidth + START_X
    );
    worldHeight = Math.max(
      worldHeight,
      schemaStartY + schemaLayout.contentHeight + HULL_PADDING_Y + START_Y
    );
    schemaStartY +=
      schemaLayout.contentHeight + HULL_PADDING_Y * 2 + SCHEMA_ROW_GAP_Y;
  }

  return { hulls, nodes, viewNodes, worldHeight, worldWidth };
}

function groupCatalogBySchema({
  schemaOrder,
  tableInfos,
  viewInfos,
}: {
  schemaOrder: string[];
  tableInfos: TableInfo[];
  viewInfos: ViewInfo[];
}) {
  const tablesBySchema = new Map<string, TableInfo[]>();
  const viewsBySchema = new Map<string, ViewInfo[]>();
  for (const schema of schemaOrder) {
    tablesBySchema.set(schema, []);
    viewsBySchema.set(schema, []);
  }
  for (const table of tableInfos) {
    tablesBySchema.get(table.schemaName)?.push(table);
  }
  for (const view of viewInfos) {
    viewsBySchema.get(view.schemaName)?.push(view);
  }
  return { tablesBySchema, viewsBySchema };
}

function layoutSchema({
  constraintsByTable,
  schemaName,
  schemaStartY,
  schemaTables,
  schemaViews,
  tone,
}: {
  constraintsByTable: Record<string, TableConstraint[]>;
  schemaName: string;
  schemaStartY: number;
  schemaTables: TableInfo[];
  schemaViews: ViewInfo[];
  tone: SchemaMapTone;
}): SchemaLayoutResult | null {
  if (schemaTables.length === 0 && schemaViews.length === 0) {
    return null;
  }

  const tableLayout = layoutSchemaTables({
    constraintsByTable,
    schemaName,
    schemaStartY,
    schemaTables,
    tone,
  });
  const viewLayout = layoutSchemaViews({
    schemaName,
    schemaStartY,
    schemaTables,
    schemaViews,
    startDepth: tableLayout.maxDepth + 1,
    tone,
  });
  const contentHeight = Math.max(
    MIN_SCHEMA_HULL_CONTENT_HEIGHT,
    tableLayout.contentHeight,
    viewLayout.contentHeight
  );
  const contentWidth = Math.max(
    NODE_WIDTH,
    tableLayout.contentWidth,
    viewLayout.contentWidth
  );

  return {
    contentHeight,
    contentWidth,
    hull: {
      height: contentHeight + HULL_PADDING_Y * 2,
      label: schemaName,
      tone,
      width: contentWidth + HULL_PADDING_X * 2,
      x: START_X - HULL_PADDING_X,
      y: schemaStartY - HULL_PADDING_Y,
    },
    nodes: tableLayout.nodes,
    viewNodes: viewLayout.viewNodes,
  };
}

function layoutSchemaTables({
  constraintsByTable,
  schemaName,
  schemaStartY,
  schemaTables,
  tone,
}: {
  constraintsByTable: Record<string, TableConstraint[]>;
  schemaName: string;
  schemaStartY: number;
  schemaTables: TableInfo[];
  tone: SchemaMapTone;
}) {
  const depths = tableDepths(schemaTables, constraintsByTable);
  const tablesByDepth = tablesGroupedByDepth(schemaTables, depths);
  const nodes: SchemaMapNode[] = [];
  let contentHeight = 0;
  let contentWidth = 0;
  let maxDepth = 0;

  for (const [depth, depthTables] of sortedDepthEntries(tablesByDepth)) {
    maxDepth = Math.max(maxDepth, depth);
    const column = tableColumnNodes({
      depth,
      schemaName,
      schemaStartY,
      tables: depthTables,
      tone,
    });
    nodes.push(...column.nodes);
    contentHeight = Math.max(contentHeight, column.height);
    contentWidth = Math.max(contentWidth, column.width);
  }

  return { contentHeight, contentWidth, maxDepth, nodes };
}

function layoutSchemaViews({
  schemaName,
  schemaStartY,
  schemaTables,
  schemaViews,
  startDepth,
  tone,
}: {
  schemaName: string;
  schemaStartY: number;
  schemaTables: TableInfo[];
  schemaViews: ViewInfo[];
  startDepth: number;
  tone: SchemaMapTone;
}) {
  const viewDepth = schemaTables.length > 0 ? startDepth : 0;
  const x = START_X + viewDepth * GRAPH_COLUMN_GAP_X;
  let y = schemaStartY;
  const viewNodes: SchemaMapViewNode[] = [];

  for (const view of schemaViews) {
    viewNodes.push({
      definitionLabel: view.definitionLabel,
      height: VIEW_NODE_HEIGHT,
      id: view.id,
      kind: "view",
      name: view.displayName,
      schemaName,
      tone,
      x,
      y,
    });
    y += VIEW_NODE_HEIGHT + NODE_GAP_Y;
  }

  return {
    contentHeight: schemaViews.length > 0 ? y - schemaStartY - NODE_GAP_Y : 0,
    contentWidth:
      schemaViews.length > 0
        ? viewDepth * GRAPH_COLUMN_GAP_X + VIEW_NODE_WIDTH
        : 0,
    viewNodes,
  };
}

function tablesGroupedByDepth(
  schemaTables: TableInfo[],
  depths: Map<string, number>
): Map<number, TableInfo[]> {
  const tablesByDepth = new Map<number, TableInfo[]>();
  for (const table of schemaTables) {
    const depth = depths.get(table.id) ?? 0;
    const depthTables = tablesByDepth.get(depth) ?? [];
    depthTables.push(table);
    tablesByDepth.set(depth, depthTables);
  }
  return tablesByDepth;
}

function sortedDepthEntries(tablesByDepth: Map<number, TableInfo[]>) {
  return [...tablesByDepth].sort(([left], [right]) => left - right);
}

function tableColumnNodes({
  depth,
  schemaName,
  schemaStartY,
  tables,
  tone,
}: {
  depth: number;
  schemaName: string;
  schemaStartY: number;
  tables: TableInfo[];
  tone: SchemaMapTone;
}) {
  const x = START_X + depth * GRAPH_COLUMN_GAP_X;
  let y = schemaStartY;
  const nodes: SchemaMapNode[] = [];

  for (const table of tables) {
    const height = tableNodeHeight(table);
    nodes.push(tableNode({ height, schemaName, table, tone, x, y }));
    y += height + NODE_GAP_Y;
  }

  return {
    height: tables.length > 0 ? y - schemaStartY - NODE_GAP_Y : 0,
    nodes,
    width: depth * GRAPH_COLUMN_GAP_X + NODE_WIDTH,
  };
}

function tableNode({
  height,
  schemaName,
  table,
  tone,
  x,
  y,
}: {
  height: number;
  schemaName: string;
  table: TableInfo;
  tone: SchemaMapTone;
  x: number;
  y: number;
}): SchemaMapNode {
  return {
    columns: table.visibleColumns,
    columnsLoaded: table.columnsLoaded,
    height,
    id: table.id,
    kind: "table",
    name: table.displayName,
    rowLabel: table.rowLabel,
    schemaName,
    tone,
    truncatedColumnCount: Math.max(
      0,
      table.columns.length - MAX_VISIBLE_COLUMNS
    ),
    x,
    y,
  };
}

function tableNodeHeight(table: ReturnType<typeof tableInfo>): number {
  return (
    HEADER_HEIGHT +
    Math.max(1, table.visibleColumns.length) * ROW_HEIGHT +
    NODE_FOOTER_HEIGHT +
    (table.columns.length > MAX_VISIBLE_COLUMNS ? ROW_HEIGHT : 0)
  );
}

function tableDepths(
  tables: ReturnType<typeof tableInfo>[],
  constraintsByTable: Record<string, TableConstraint[]>
): Map<string, number> {
  const tableIds = new Set(tables.map((table) => table.id));
  const tableById = new Map(tables.map((table) => [table.id, table]));
  const memo = new Map<string, number>();
  const visiting = new Set<string>();

  function depthFor(tableId: string): number {
    const memoized = memo.get(tableId);
    if (memoized !== undefined) {
      return memoized;
    }
    if (visiting.has(tableId)) {
      return 0;
    }
    visiting.add(tableId);
    let depth = 0;
    for (const constraint of constraintsByTable[tableId] ?? []) {
      if (
        constraint.type === ConstraintType.FOREIGN_KEY &&
        tableIds.has(constraint.referencedTable)
      ) {
        depth = Math.max(depth, depthFor(constraint.referencedTable) + 1);
      }
    }
    visiting.delete(tableId);
    memo.set(tableId, depth);
    return depth;
  }

  for (const table of tableById.values()) {
    depthFor(table.id);
  }

  return memo;
}

function buildEdges({
  constraintsByTable,
  nodeById,
  schemaTone,
  tableInfos,
}: {
  constraintsByTable: Record<string, TableConstraint[]>;
  nodeById: Map<string, SchemaMapNode>;
  schemaTone: Map<string, SchemaMapTone>;
  tableInfos: ReturnType<typeof tableInfo>[];
}): SchemaMapEdge[] {
  const edges: SchemaMapEdge[] = [];
  for (const table of tableInfos) {
    const source = nodeById.get(table.id);
    if (!source) {
      continue;
    }
    for (const constraint of constraintsByTable[table.id] ?? []) {
      if (constraint.type !== ConstraintType.FOREIGN_KEY) {
        continue;
      }
      const target = nodeById.get(constraint.referencedTable);
      if (!target) {
        continue;
      }
      edges.push(
        edgeForConstraint({
          constraint,
          source,
          target,
          tone: schemaTone.get(source.schemaName) ?? source.tone,
        })
      );
    }
  }
  return edges;
}

function edgeForConstraint({
  constraint,
  source,
  target,
  tone,
}: {
  constraint: TableConstraint;
  source: SchemaMapNode;
  target: SchemaMapNode;
  tone: SchemaMapTone;
}): SchemaMapEdge {
  const sourceColumnName = constraint.columnNames[0] ?? "";
  const targetColumnName = constraint.referencedColumnNames[0] ?? "id";
  const sourceY = edgeAnchorY(source, sourceColumnName);
  const targetY = edgeAnchorY(target, targetColumnName);
  const sourceOnLeft = source.x < target.x;
  const sourceX = sourceOnLeft ? source.x + NODE_WIDTH : source.x;
  const targetX = sourceOnLeft ? target.x : target.x + NODE_WIDTH;
  const control = Math.max(
    EDGE_MIN_CONTROL_OFFSET,
    Math.abs(targetX - sourceX) / 2
  );
  const c1 = sourceOnLeft ? sourceX + control : sourceX - control;
  const c2 = sourceOnLeft ? targetX - control : targetX + control;

  return {
    d: `M ${sourceX} ${sourceY} C ${c1} ${sourceY}, ${c2} ${targetY}, ${targetX} ${targetY}`,
    fromLabel: `${source.name}.${sourceColumnName}`,
    id: `${source.id}:${constraint.constraintName || sourceColumnName}:${target.id}`,
    source: source.id,
    target: target.id,
    toLabel: `${target.name}.${targetColumnName}`,
    tone,
  };
}

function edgeAnchorY(node: SchemaMapNode, columnName: string): number {
  const columnIndex = node.columns.findIndex(
    (column) => column.name === columnName
  );
  if (columnIndex >= 0) {
    return node.y + HEADER_HEIGHT + columnIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
  }
  if (node.truncatedColumnCount > 0) {
    return (
      node.y + HEADER_HEIGHT + node.columns.length * ROW_HEIGHT + ROW_HEIGHT / 2
    );
  }
  return node.y + node.height / 2;
}

export type {
  BuildSchemaMapModelInput,
  SchemaMapEdge,
  SchemaMapHull,
  SchemaMapModel,
  SchemaMapNode,
  SchemaMapSchemaOption,
  SchemaMapTone,
  SchemaMapViewNode,
};
export {
  buildSchemaMapModel,
  NODE_WIDTH,
  selectSchemaMapMetadataTableNames,
  VIEW_NODE_WIDTH,
};
