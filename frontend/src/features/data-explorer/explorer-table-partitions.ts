import { formatBytes, parseTableQualifiedName } from "@/lib/console-resources";
import type {
  TablePartition,
  TablePartitionMetadata,
} from "@/protogen/querylane/console/v1alpha1/table_pb";

type PartitionBoundKind = "default" | "hash" | "list" | "other" | "range";

interface PartitionDisplayRow {
  boundKind: PartitionBoundKind;
  boundLabel: string;
  estimatedRows: number;
  isCurrent: boolean;
  isDefault: boolean;
  name: string;
  partitionBound: string;
  resourceLabel: string;
  rowsLabel: string;
  schemaName: string;
  shareLabel: string;
  shareWidthClassName: string;
  sizeBytes: number;
  sizeLabel: string;
  table: string;
}

interface PartitionRowsSummary {
  totalRowsLabel: string;
  totalSizeLabel: string;
}

interface PartitionViewModel {
  defaultPartition: PartitionDisplayRow | undefined;
  rows: PartitionDisplayRow[];
  totalRowsLabel: string;
  totalSizeLabel: string;
}

const PARTITION_SHARE_WIDTH_CLASSES = [
  "w-0",
  "w-1/12",
  "w-2/12",
  "w-3/12",
  "w-4/12",
  "w-5/12",
  "w-6/12",
  "w-7/12",
  "w-8/12",
  "w-9/12",
  "w-10/12",
  "w-11/12",
  "w-full",
] as const;
// Range bounds may carry a time-of-day suffix, e.g. FROM ('2026-01-01 00:00:00+00').
const RANGE_BOUNDS_PATTERN =
  /FROM \('(\d{4}-\d{2}-\d{2})[^']*'\) TO \('(\d{4}-\d{2}-\d{2})[^']*'\)/i;
const FOR_VALUES_PREFIX_PATTERN = /^FOR VALUES\s+/i;
const TRAILING_ZERO_DECIMAL = /\.0+$/;
const TRAILING_DECIMAL_ZEROES = /(\.\d*?)0+$/;
const THOUSAND = 1000;
const MILLION = 1_000_000;
const BILLION = 1_000_000_000;
const PERCENT_FACTOR = 100;

function hasPartitionMetadata(
  metadata: TablePartitionMetadata | undefined
): metadata is TablePartitionMetadata {
  return Boolean(
    metadata &&
      (metadata.partitionKey ||
        metadata.partitionBound ||
        metadata.parentTable ||
        metadata.childPartitions.length > 0)
  );
}

function derivePartitionTabCount(
  metadata: TablePartitionMetadata | undefined
): number | undefined {
  if (!metadata || metadata.partitionCount <= 0) {
    return;
  }
  return metadata.partitionCount;
}

function formatPartitionResourceLabel(resourceName: string): string {
  if (!resourceName) {
    return "—";
  }
  try {
    const { schema, table } = parseTableQualifiedName(resourceName);
    return `${schema}.${table}`;
  } catch {
    return resourceName;
  }
}

function partitionSchemaName(partition: TablePartition): string {
  if (!partition.table) {
    return "—";
  }
  try {
    return parseTableQualifiedName(partition.table).schema;
  } catch {
    return "—";
  }
}

function partitionBoundKind(partition: TablePartition): PartitionBoundKind {
  const bound = partition.partitionBound.trim().toUpperCase();
  if (bound === "DEFAULT" || bound.includes(" DEFAULT")) {
    return "default";
  }
  if (bound.startsWith("FOR VALUES FROM")) {
    return "range";
  }
  if (bound.startsWith("FOR VALUES IN")) {
    return "list";
  }
  if (bound.startsWith("FOR VALUES WITH")) {
    return "hash";
  }
  return "other";
}

function filterPartitionDisplayRows(
  rows: PartitionDisplayRow[],
  search: string
): PartitionDisplayRow[] {
  const query = search.trim().toLocaleLowerCase();
  if (!query) {
    return rows;
  }

  return rows.filter((row) =>
    [
      row.name,
      row.resourceLabel,
      row.schemaName,
      row.partitionBound,
      row.boundLabel,
    ]
      .join(" ")
      .toLocaleLowerCase()
      .includes(query)
  );
}

function summarizePartitionDisplayRows(
  rows: PartitionDisplayRow[]
): PartitionRowsSummary {
  const totalRows = rows.reduce((sum, row) => sum + row.estimatedRows, 0);
  const totalSize = rows.reduce((sum, row) => sum + row.sizeBytes, 0);

  return {
    totalRowsLabel: totalRows > 0 ? formatPartitionTotalRows(totalRows) : "—",
    totalSizeLabel: totalSize > 0 ? formatBytes(totalSize) : "—",
  };
}

function bigintToNumber(value: bigint): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return 0;
  }
  return numeric;
}

function formatPartitionRows(value: number): string {
  if (value < THOUSAND) {
    return String(Math.round(value));
  }
  if (value < MILLION) {
    const scaled = value / THOUSAND;
    return `${scaled
      .toFixed(scaled < 10 ? 1 : 0)
      .replace(TRAILING_ZERO_DECIMAL, "")}k`;
  }
  if (value < BILLION) {
    return `${(value / MILLION)
      .toFixed(2)
      .replace(TRAILING_ZERO_DECIMAL, "")
      .replace(TRAILING_DECIMAL_ZEROES, "$1")}M`;
  }
  return `${(value / BILLION).toFixed(1).replace(TRAILING_ZERO_DECIMAL, "")}B`;
}

function formatPartitionTotalRows(value: number): string {
  if (value < MILLION) {
    return formatPartitionRows(value);
  }
  if (value < BILLION) {
    return `${(value / MILLION)
      .toFixed(1)
      .replace(TRAILING_ZERO_DECIMAL, "")}M`;
  }
  return `${(value / BILLION).toFixed(1)}B`;
}

function widthClassForRatio<T extends readonly [string, ...string[]]>(
  ratio: number,
  classes: T
): T[number] {
  if (!Number.isFinite(ratio) || ratio <= 0) {
    return classes[0];
  }
  const maxIndex = classes.length - 1;
  const bounded = Math.min(Math.max(ratio, 0), 1);
  return classes[Math.max(1, Math.round(bounded * maxIndex))] ?? classes[0];
}

function partitionDisplayName(partition: TablePartition): string {
  if (partition.displayName) {
    return partition.displayName;
  }
  if (!partition.table) {
    return "—";
  }
  try {
    return parseTableQualifiedName(partition.table).table;
  } catch {
    return partition.table;
  }
}

function rangeBoundDayLabels(partitionBound: string) {
  const bounds = RANGE_BOUNDS_PATTERN.exec(partitionBound);
  const start = bounds?.[1];
  const end = bounds?.[2];
  if (!(start && end)) {
    return;
  }
  return { end, start };
}

function partitionBoundLabel(
  partitionBound: string,
  kind: PartitionBoundKind
): string {
  if (kind === "default") {
    return "DEFAULT — catches rows outside every range";
  }
  if (kind === "range") {
    const bounds = rangeBoundDayLabels(partitionBound);
    if (bounds) {
      return `${bounds.start} → ${bounds.end}`;
    }
  }
  const withoutPrefix = partitionBound.replace(FOR_VALUES_PREFIX_PATTERN, "");
  return withoutPrefix || "—";
}

function rangeBoundDates(partitionBound: string) {
  const bounds = rangeBoundDayLabels(partitionBound);
  if (!bounds) {
    return;
  }

  const start = Date.parse(`${bounds.start}T00:00:00Z`);
  const end = Date.parse(`${bounds.end}T00:00:00Z`);
  if (!(Number.isFinite(start) && Number.isFinite(end)) || end <= start) {
    return;
  }
  return { end, start };
}

function utcDay(value: Date): number {
  return Date.UTC(
    value.getUTCFullYear(),
    value.getUTCMonth(),
    value.getUTCDate()
  );
}

function isDateInsideRange(partitionBound: string, currentDate: Date): boolean {
  const bounds = rangeBoundDates(partitionBound);
  if (!bounds) {
    return false;
  }

  const current = utcDay(currentDate);
  return current >= bounds.start && current < bounds.end;
}

function buildPartitionDisplayRow({
  currentPartition,
  partition,
  rowCount,
  size,
  totalRows,
}: {
  currentPartition: string | undefined;
  partition: TablePartition;
  rowCount: number;
  size: number;
  totalRows: number;
}): PartitionDisplayRow {
  const boundKind = partitionBoundKind(partition);
  const share = totalRows > 0 ? rowCount / totalRows : 0;
  const isDefault = boundKind === "default";
  return {
    boundKind,
    boundLabel: partitionBoundLabel(partition.partitionBound, boundKind),
    estimatedRows: rowCount,
    isCurrent: !isDefault && currentPartition === partition.table,
    isDefault,
    name: partitionDisplayName(partition),
    partitionBound: partition.partitionBound,
    resourceLabel: formatPartitionResourceLabel(partition.table),
    rowsLabel: rowCount > 0 ? formatPartitionRows(rowCount) : "—",
    schemaName: partitionSchemaName(partition),
    shareLabel: totalRows > 0 ? `${Math.round(share * PERCENT_FACTOR)}%` : "—",
    shareWidthClassName: widthClassForRatio(
      share,
      PARTITION_SHARE_WIDTH_CLASSES
    ),
    sizeBytes: size,
    sizeLabel: size > 0 ? formatBytes(size) : "—",
    table: partition.table,
  };
}

function derivePartitionViewModel({
  currentDate = new Date(),
  partitions,
}: {
  currentDate?: Date | undefined;
  partitions: TablePartition[];
}): PartitionViewModel {
  const rowsWithNumbers = partitions.map((partition) => ({
    partition,
    rows: bigintToNumber(partition.estimatedRows),
    size: bigintToNumber(partition.sizeBytes),
  }));
  const totalRows = rowsWithNumbers.reduce((sum, row) => sum + row.rows, 0);
  const totalSize = rowsWithNumbers.reduce((sum, row) => sum + row.size, 0);
  const currentPartition = rowsWithNumbers.find(({ partition }) =>
    isDateInsideRange(partition.partitionBound, currentDate)
  )?.partition.table;
  const rows = rowsWithNumbers.map(({ partition, rows: rowCount, size }) =>
    buildPartitionDisplayRow({
      currentPartition,
      partition,
      rowCount,
      size,
      totalRows,
    })
  );

  return {
    defaultPartition: rows.find((row) => row.isDefault),
    rows,
    totalRowsLabel: totalRows > 0 ? formatPartitionTotalRows(totalRows) : "—",
    totalSizeLabel: totalSize > 0 ? formatBytes(totalSize) : "—",
  };
}

export type {
  PartitionBoundKind,
  PartitionDisplayRow,
  PartitionRowsSummary,
  PartitionViewModel,
};
export {
  derivePartitionTabCount,
  derivePartitionViewModel,
  filterPartitionDisplayRows,
  formatPartitionResourceLabel,
  hasPartitionMetadata,
  partitionBoundKind,
  partitionSchemaName,
  summarizePartitionDisplayRows,
};
