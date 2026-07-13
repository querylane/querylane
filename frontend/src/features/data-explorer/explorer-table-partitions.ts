import { formatBytes, parseTableQualifiedName } from "@/lib/console-resources";
import type {
  TablePartition,
  TablePartitionMetadata,
} from "@/protogen/querylane/console/v1alpha1/table_pb";

type PartitionBoundKind = "default" | "hash" | "list" | "other" | "range";
type PartitionBarTone = "current" | "default" | "normal" | "selected";

interface ChildPartitionFilters {
  boundKinds?: PartitionBoundKind[] | undefined;
  schemaNames?: string[] | undefined;
}

interface PartitionDisplayRow {
  axisLabel: string;
  barHeightClassName: string;
  barHeightPercent: number;
  barTone: PartitionBarTone;
  boundKind: PartitionBoundKind;
  boundLabel: string;
  estimatedRows: number;
  hasProjection: boolean;
  isCurrent: boolean;
  isDefault: boolean;
  name: string;
  partitionBound: string;
  projectedHeightClassName: string;
  projectedHeightPercent: number;
  projectedRowsLabel: string;
  resourceLabel: string;
  rowsLabel: string;
  schemaName: string;
  shareLabel: string;
  shareWidthClassName: string;
  sizeBytes: number;
  sizeLabel: string;
  table: string;
}

interface PartitionRowFilters {
  boundKinds?: PartitionBoundKind[] | undefined;
  schemaNames?: string[] | undefined;
  search?: string | undefined;
}

interface PartitionRowsSummary {
  totalRowsLabel: string;
  totalSizeLabel: string;
}

interface PartitionViewModel {
  defaultPartition: PartitionDisplayRow | undefined;
  partitionExpressionLabel: string;
  partitionStrategyLabel: string;
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
const PARTITION_BAR_HEIGHT_CLASSES = [
  "h-0",
  "h-1/12",
  "h-2/12",
  "h-3/12",
  "h-4/12",
  "h-5/12",
  "h-6/12",
  "h-7/12",
  "h-8/12",
  "h-9/12",
  "h-10/12",
  "h-11/12",
  "h-full",
] as const;
const MONTH_LABELS = [
  "",
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;
const PARTITION_BOUND_KIND_AXIS_LABELS: Record<PartitionBoundKind, string> = {
  default: "default",
  hash: "hash",
  list: "list",
  other: "other",
  range: "range",
};
const RANGE_START_PATTERN = /FROM \('(\d{4})-(\d{2})-(\d{2})'\)/i;
const RANGE_BOUNDS_PATTERN =
  /FROM \('(\d{4})-(\d{2})-(\d{2})'\) TO \('(\d{4})-(\d{2})-(\d{2})'\)/i;
const PARTITION_KEY_EXPRESSION_PATTERN = /^[A-Z]+\s*\((.+)\)$/i;
const TRAILING_ZERO_DECIMAL = /\.0+$/;
const TRAILING_DECIMAL_ZEROES = /(\.\d*?)0+$/;
const THOUSAND = 1000;
const MILLION = 1_000_000;
const BILLION = 1_000_000_000;
const PERCENT_FACTOR = 100;
const MONTHS_PER_QUARTER = 3;
const MIN_BAR_HEIGHT_PERCENT = 3;
const HOURS_PER_DAY = 24;
const MINUTES_PER_HOUR = 60;
const SECONDS_PER_MINUTE = 60;
const MILLISECONDS_PER_SECOND = 1000;
const DAY_MILLISECONDS =
  HOURS_PER_DAY *
  MINUTES_PER_HOUR *
  SECONDS_PER_MINUTE *
  MILLISECONDS_PER_SECOND;

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

function filterChildPartitions(
  partitions: TablePartition[],
  filters: ChildPartitionFilters
): TablePartition[] {
  const schemaNames = filters.schemaNames ?? [];
  const boundKinds = filters.boundKinds ?? [];
  return partitions.filter((partition) => {
    if (
      schemaNames.length > 0 &&
      !schemaNames.includes(partitionSchemaName(partition))
    ) {
      return false;
    }
    if (
      boundKinds.length > 0 &&
      !boundKinds.includes(partitionBoundKind(partition))
    ) {
      return false;
    }
    return true;
  });
}

function filterPartitionDisplayRows(
  rows: PartitionDisplayRow[],
  filters: PartitionRowFilters
): PartitionDisplayRow[] {
  const search = filters.search?.trim().toLocaleLowerCase() ?? "";
  const schemaNames = filters.schemaNames ?? [];
  const boundKinds = filters.boundKinds ?? [];

  return rows.filter((row) => {
    if (schemaNames.length > 0 && !schemaNames.includes(row.schemaName)) {
      return false;
    }
    if (boundKinds.length > 0 && !boundKinds.includes(row.boundKind)) {
      return false;
    }
    if (!search) {
      return true;
    }

    return [
      row.name,
      row.resourceLabel,
      row.schemaName,
      row.partitionBound,
      row.boundLabel,
      row.axisLabel,
      row.rowsLabel,
      row.sizeLabel,
      row.shareLabel,
    ]
      .join(" ")
      .toLocaleLowerCase()
      .includes(search);
  });
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

function partitionExpressionLabel(partitionKey: string): string {
  const expression = PARTITION_KEY_EXPRESSION_PATTERN.exec(partitionKey)?.[1];
  return expression?.trim() || partitionKey || "partition key";
}

function rangeAxisLabel(partitionBound: string, kind: PartitionBoundKind) {
  if (kind === "default") {
    return "default";
  }
  if (kind !== "range") {
    return PARTITION_BOUND_KIND_AXIS_LABELS[kind];
  }
  const bounds = RANGE_BOUNDS_PATTERN.exec(partitionBound);
  const start = RANGE_START_PATTERN.exec(partitionBound);
  if (!(start?.[1] && start[2])) {
    return "range";
  }
  const startYear = start[1];
  const startMonth = Number.parseInt(start[2], 10);
  if (
    bounds?.[1] &&
    bounds[2] &&
    bounds[4] &&
    bounds[5] &&
    Number.parseInt(bounds[5], 10) - Number.parseInt(bounds[2], 10) ===
      MONTHS_PER_QUARTER
  ) {
    const quarter = Math.floor((startMonth - 1) / MONTHS_PER_QUARTER) + 1;
    return `Q${quarter} ${startYear.slice(2)}`;
  }
  return `${MONTH_LABELS[startMonth] ?? "range"} ${startYear.slice(2)}`;
}

function partitionBarTone({
  isCurrent,
  isDefault,
  isSelected,
}: {
  isCurrent: boolean;
  isDefault: boolean;
  isSelected: boolean;
}): PartitionBarTone {
  if (isSelected) {
    return "selected";
  }
  if (isDefault) {
    return "default";
  }
  if (isCurrent) {
    return "current";
  }
  return "normal";
}

function partitionBoundLabel(partitionBound: string): string {
  if (partitionBound === "DEFAULT") {
    return "DEFAULT — catches rows outside every range";
  }
  return partitionBound || "—";
}

function rangeBoundDates(partitionBound: string) {
  const bounds = RANGE_BOUNDS_PATTERN.exec(partitionBound);
  if (
    !(
      bounds?.[1] &&
      bounds[2] &&
      bounds[3] &&
      bounds[4] &&
      bounds[5] &&
      bounds[6]
    )
  ) {
    return;
  }

  const start = Date.UTC(
    Number.parseInt(bounds[1], 10),
    Number.parseInt(bounds[2], 10) - 1,
    Number.parseInt(bounds[3], 10)
  );
  const end = Date.UTC(
    Number.parseInt(bounds[4], 10),
    Number.parseInt(bounds[5], 10) - 1,
    Number.parseInt(bounds[6], 10)
  );
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

function elapsedRangeRatio(partitionBound: string, currentDate: Date): number {
  const bounds = rangeBoundDates(partitionBound);
  if (!bounds) {
    return 0;
  }

  const current = utcDay(currentDate);
  const elapsedDays = Math.max(
    1,
    Math.ceil((current - bounds.start) / DAY_MILLISECONDS)
  );
  const totalDays = Math.max(1, (bounds.end - bounds.start) / DAY_MILLISECONDS);
  return Math.min(Math.max(elapsedDays / totalDays, 0), 1);
}

function projectedRows({
  currentDate,
  isCurrent,
  partitionBound,
  rows,
}: {
  currentDate: Date;
  isCurrent: boolean;
  partitionBound: string;
  rows: number;
}): number {
  if (!(isCurrent && rows > 0)) {
    return rows;
  }

  const elapsed = elapsedRangeRatio(partitionBound, currentDate);
  if (elapsed <= 0) {
    return rows;
  }
  return Math.max(rows, rows / elapsed);
}

function percentOfMax(value: number, max: number): number {
  if (
    !(Number.isFinite(value) && Number.isFinite(max)) ||
    max <= 0 ||
    value <= 0
  ) {
    return 0;
  }
  return Math.max(MIN_BAR_HEIGHT_PERCENT, (value / max) * PERCENT_FACTOR);
}

function derivePartitionViewModel({
  currentDate = new Date(),
  partitionKey,
  partitions,
  selectedPartition,
}: {
  currentDate?: Date | undefined;
  partitionKey: string;
  partitions: TablePartition[];
  selectedPartition?: string | undefined;
}): PartitionViewModel {
  const rowsWithNumbers = partitions.map((partition) => ({
    partition,
    rows: bigintToNumber(partition.estimatedRows),
    size: bigintToNumber(partition.sizeBytes),
  }));
  const totalRows = rowsWithNumbers.reduce((sum, row) => sum + row.rows, 0);
  const totalSize = rowsWithNumbers.reduce((sum, row) => sum + row.size, 0);
  const maxRows = Math.max(...rowsWithNumbers.map((row) => row.rows), 0);
  const nonDefaultRows = rowsWithNumbers.filter(
    ({ partition }) => partitionBoundKind(partition) !== "default"
  );
  const currentPartition =
    nonDefaultRows.find(({ partition }) =>
      isDateInsideRange(partition.partitionBound, currentDate)
    )?.partition.table ?? nonDefaultRows.at(-1)?.partition.table;
  const maxProjectedRows = Math.max(
    ...rowsWithNumbers.map(({ partition, rows }) =>
      projectedRows({
        currentDate,
        isCurrent: currentPartition === partition.table,
        partitionBound: partition.partitionBound,
        rows,
      })
    ),
    0
  );
  const rows = rowsWithNumbers.map(({ partition, rows, size }) => {
    const boundKind = partitionBoundKind(partition);
    const name = partitionDisplayName(partition);
    const share = totalRows > 0 ? rows / totalRows : 0;
    const isSelected = selectedPartition === partition.table;
    const isDefault = boundKind === "default";
    const isCurrent = !isDefault && currentPartition === partition.table;
    const projected = projectedRows({
      currentDate,
      isCurrent,
      partitionBound: partition.partitionBound,
      rows,
    });
    const barHeightPercent = percentOfMax(rows, maxProjectedRows || maxRows);
    const projectedHeightPercent = percentOfMax(projected, maxProjectedRows);
    const projectedExtraHeightPercent = Math.max(
      projectedHeightPercent - barHeightPercent,
      0
    );

    return {
      axisLabel: rangeAxisLabel(partition.partitionBound, boundKind),
      barHeightClassName: widthClassForRatio(
        barHeightPercent / PERCENT_FACTOR,
        PARTITION_BAR_HEIGHT_CLASSES
      ),
      barHeightPercent,
      barTone: partitionBarTone({ isCurrent, isDefault, isSelected }),
      boundKind,
      boundLabel: partitionBoundLabel(partition.partitionBound),
      estimatedRows: rows,
      hasProjection: isCurrent && projected > rows,
      isCurrent,
      isDefault,
      name,
      partitionBound: partition.partitionBound,
      projectedHeightClassName: widthClassForRatio(
        projectedExtraHeightPercent / PERCENT_FACTOR,
        PARTITION_BAR_HEIGHT_CLASSES
      ),
      projectedHeightPercent,
      projectedRowsLabel:
        projected > rows ? formatPartitionRows(projected) : "—",
      resourceLabel: formatPartitionResourceLabel(partition.table),
      rowsLabel: rows > 0 ? formatPartitionRows(rows) : "—",
      schemaName: partitionSchemaName(partition),
      shareLabel:
        totalRows > 0 ? `${Math.round(share * PERCENT_FACTOR)}%` : "—",
      shareWidthClassName: widthClassForRatio(
        share,
        PARTITION_SHARE_WIDTH_CLASSES
      ),
      sizeBytes: size,
      sizeLabel: size > 0 ? formatBytes(size) : "—",
      table: partition.table,
    } satisfies PartitionDisplayRow;
  });

  return {
    defaultPartition: rows.find((row) => row.isDefault),
    partitionExpressionLabel: partitionExpressionLabel(partitionKey),
    partitionStrategyLabel: partitionKey || "—",
    rows,
    totalRowsLabel: totalRows > 0 ? formatPartitionTotalRows(totalRows) : "—",
    totalSizeLabel: totalSize > 0 ? formatBytes(totalSize) : "—",
  };
}

export type {
  ChildPartitionFilters,
  PartitionBarTone,
  PartitionBoundKind,
  PartitionDisplayRow,
  PartitionRowFilters,
  PartitionRowsSummary,
  PartitionViewModel,
};
export {
  derivePartitionTabCount,
  derivePartitionViewModel,
  filterChildPartitions,
  filterPartitionDisplayRows,
  formatPartitionResourceLabel,
  hasPartitionMetadata,
  partitionBoundKind,
  partitionSchemaName,
  summarizePartitionDisplayRows,
};
