import { format } from "date-fns";
import { parseTableQualifiedName } from "@/lib/console-resources";
import type {
  TableCell,
  TableResultColumn,
} from "@/protogen/querylane/console/v1alpha1/table_data_pb";

type ExportFormat = "csv" | "sql" | "json";

interface ExportPayload {
  contents: string;
  filename: string;
  mimeType: string;
}

interface ChunkedExportPayload {
  contents: BlobPart[];
  filename: string;
  mimeType: string;
}

interface ExportFileDetails {
  extensions: string[];
  filename: string;
  mimeType: string;
}

/**
 * A row to export. `cells` is keyed by {@link resultColumnKeys}: the column
 * name when names are unique, which explorer selections always are, and a
 * position-suffixed name for repeated names in ad-hoc SQL results.
 */
interface SelectedRow {
  cells: Map<string, TableCell | undefined>;
}

type ExportResult =
  | { ok: true; payload: ExportPayload }
  | { ok: false; reason: "truncated"; truncatedRowCount: number };

type ChunkedExportResult =
  | { ok: true; payload: ChunkedExportPayload }
  | { ok: false; reason: "truncated"; truncatedRowCount: number };

interface ChunkedExportBuilder {
  addRows: (rows: SelectedRow[]) => void;
  drainChunks: () => BlobPart[];
  finish: () => ChunkedExportResult;
}

/**
 * Result columns may repeat a name (`SELECT a.id, b.id`). Every consumer that
 * keys cells by column needs a unique key per position, so repeated names are
 * suffixed with their occurrence; the first occurrence keeps the bare name.
 */
function resultColumnKeys(columns: readonly TableResultColumn[]) {
  const seen = new Map<string, number>();
  return columns.map((column) => {
    const count = seen.get(column.columnName) ?? 0;
    seen.set(column.columnName, count + 1);
    return count === 0 ? column.columnName : `${column.columnName}#${count}`;
  });
}

function countRowsWithTruncatedCells(
  rows: SelectedRow[],
  keys: readonly string[]
) {
  let count = 0;
  for (const row of rows) {
    for (const key of keys) {
      if (row.cells.get(key)?.truncated === true) {
        count += 1;
        break;
      }
    }
  }
  return count;
}

const FILENAME_DATE_FORMAT = "yyyy-MM-dd";
const SAFE_FILENAME_PATTERN = /[^a-zA-Z0-9_.-]+/gu;
const SQL_NUMERIC_PATTERN = /^-?\d+(?:\.\d+)?$/u;
const CSV_FORMULA_PREFIX_PATTERN = /^[=+\-@\t\r]/u;
const CSV_QUOTE_REQUIRED_PATTERN = /[",\n\r]/u;
const CSV_QUOTE_PATTERN = /"/gu;
const SQL_QUOTE_PATTERN = /'/gu;
const SQL_IDENTIFIER_QUOTE_PATTERN = /"/gu;

function buildFilename(table: string, ext: string) {
  const date = format(new Date(), FILENAME_DATE_FORMAT);
  const safeTable = table.replaceAll(SAFE_FILENAME_PATTERN, "_") || "table";
  return `${safeTable}_${date}.${ext}`;
}

function getExportFileDetails(
  exportFormat: ExportFormat,
  resourceName: string
) {
  const { table } = parseTableQualifiedName(resourceName);
  switch (exportFormat) {
    case "json":
      return {
        extensions: [".json"],
        filename: buildFilename(table, "json"),
        mimeType: "application/json",
      } satisfies ExportFileDetails;
    case "sql":
      return {
        extensions: [".sql"],
        filename: buildFilename(table, "sql"),
        mimeType: "application/sql",
      } satisfies ExportFileDetails;
    case "csv":
    default:
      return {
        extensions: [".csv"],
        filename: buildFilename(table, "csv"),
        mimeType: "text/csv;charset=utf-8",
      } satisfies ExportFileDetails;
  }
}

function escapeCsv(value: string, neutralizeFormula = true) {
  const safeValue =
    neutralizeFormula && CSV_FORMULA_PREFIX_PATTERN.test(value)
      ? `'${value}`
      : value;
  if (safeValue === "" || CSV_QUOTE_REQUIRED_PATTERN.test(safeValue)) {
    return `"${safeValue.replaceAll(CSV_QUOTE_PATTERN, '""')}"`;
  }
  return safeValue;
}

type RawCellValue =
  | { kind: "bool"; value: boolean }
  | { kind: "null" }
  | { kind: "number"; text: string }
  | { kind: "text"; text: string };

const BYTE_HEX_WIDTH = 2;
const HEX_RADIX = 16;

function bytesToPostgresHex(bytes: Uint8Array) {
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(HEX_RADIX).padStart(BYTE_HEX_WIDTH, "0");
  }
  return `\\x${hex}`;
}

function rawCellValue(cell: TableCell | undefined) {
  const kind = cell?.value?.kind;
  if (!kind || kind.case === "nullValue") {
    return { kind: "null" } satisfies RawCellValue;
  }
  switch (kind.case) {
    case "boolValue":
      return { kind: "bool", value: kind.value } satisfies RawCellValue;
    case "bytesValue":
      return {
        kind: "text",
        text: bytesToPostgresHex(kind.value),
      } satisfies RawCellValue;
    case "doubleValue":
      return {
        kind: "number",
        text: String(kind.value),
      } satisfies RawCellValue;
    case "int64Value":
      return {
        kind: "number",
        text: kind.value.toString(),
      } satisfies RawCellValue;
    case "numericValue":
      return { kind: "number", text: kind.value ?? "" } satisfies RawCellValue;
    case "jsonValue":
      return { kind: "text", text: kind.value ?? "" } satisfies RawCellValue;
    case "timestampValue":
      return { kind: "text", text: kind.value ?? "" } satisfies RawCellValue;
    case "stringValue":
      return { kind: "text", text: kind.value } satisfies RawCellValue;
    case undefined:
    default:
      return { kind: "text", text: kind.value ?? "" } satisfies RawCellValue;
  }
}

function rawCellText(value: RawCellValue) {
  switch (value.kind) {
    case "null":
      return "";
    case "bool":
      return value.value ? "true" : "false";
    case "number":
    case "text":
    default:
      return value.text;
  }
}

function formatCellForClipboard(cell: TableCell | undefined) {
  return rawCellText(rawCellValue(cell));
}

function formatCsvRow(row: SelectedRow, keys: readonly string[]) {
  const cells = keys.map((key) => {
    const raw = rawCellValue(row.cells.get(key));
    return raw.kind === "null"
      ? ""
      : escapeCsv(rawCellText(raw), raw.kind === "text");
  });
  return cells.join(",");
}

function formatRowsAsCsv(
  rows: SelectedRow[],
  columns: TableResultColumn[],
  resourceName: string
) {
  const { table } = parseTableQualifiedName(resourceName);
  const header = columns
    .map((column) => escapeCsv(column.columnName))
    .join(",");
  const keys = resultColumnKeys(columns);
  const lines = [header];
  for (const row of rows) {
    lines.push(formatCsvRow(row, keys));
  }
  return {
    contents: `${lines.join("\n")}\n`,
    filename: buildFilename(table, "csv"),
    mimeType: "text/csv;charset=utf-8",
  } satisfies ExportPayload;
}

function formatJsonRecord(
  row: SelectedRow,
  columns: TableResultColumn[],
  keys: readonly string[]
) {
  const record: Record<string, string | boolean | null> = {};
  for (const [index, column] of columns.entries()) {
    const raw = rawCellValue(row.cells.get(keys[index] ?? column.columnName));
    if (raw.kind === "null") {
      record[column.columnName] = null;
    } else if (raw.kind === "bool") {
      record[column.columnName] = raw.value;
    } else {
      record[column.columnName] = raw.text;
    }
  }
  return record;
}

function formatRowsAsJson(
  rows: SelectedRow[],
  columns: TableResultColumn[],
  resourceName: string
) {
  const { table } = parseTableQualifiedName(resourceName);
  const keys = resultColumnKeys(columns);
  const records = rows.map((row) => formatJsonRecord(row, columns, keys));
  return {
    contents: `${JSON.stringify(records, null, 2)}\n`,
    filename: buildFilename(table, "json"),
    mimeType: "application/json",
  } satisfies ExportPayload;
}

function quoteSqlIdentifier(identifier: string) {
  return `"${identifier.replaceAll(SQL_IDENTIFIER_QUOTE_PATTERN, '""')}"`;
}

function formatSqlLiteral(cell: TableCell | undefined) {
  const raw = rawCellValue(cell);
  if (raw.kind === "null") {
    return "NULL";
  }
  if (raw.kind === "bool") {
    return raw.value ? "TRUE" : "FALSE";
  }
  if (raw.kind === "number" && SQL_NUMERIC_PATTERN.test(raw.text)) {
    return raw.text;
  }
  return `'${raw.text.replaceAll(SQL_QUOTE_PATTERN, "''")}'`;
}

function formatSqlValueRow(row: SelectedRow, keys: readonly string[]) {
  const literals = keys
    .map((key) => formatSqlLiteral(row.cells.get(key)))
    .join(", ");
  return `  (${literals})`;
}

function formatRowsAsSql(
  rows: SelectedRow[],
  columns: TableResultColumn[],
  resourceName: string
) {
  const { schema, table } = parseTableQualifiedName(resourceName);
  const qualified = `${quoteSqlIdentifier(schema)}.${quoteSqlIdentifier(table)}`;
  const columnList = columns
    .map((column) => quoteSqlIdentifier(column.columnName))
    .join(", ");

  if (rows.length === 0 || columns.length === 0) {
    return {
      contents: `-- No rows selected for ${qualified}\n`,
      filename: buildFilename(table, "sql"),
      mimeType: "application/sql",
    } satisfies ExportPayload;
  }

  const keys = resultColumnKeys(columns);
  const valueLines = rows.map((row) => formatSqlValueRow(row, keys));

  const contents = `INSERT INTO ${qualified} (${columnList}) VALUES\n${valueLines.join(
    ",\n"
  )};\n`;
  return {
    contents,
    filename: buildFilename(table, "sql"),
    mimeType: "application/sql",
  } satisfies ExportPayload;
}

function indentJsonChunk(json: string) {
  return json
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");
}

function appendCsvRows(
  chunks: string[],
  rows: SelectedRow[],
  keys: readonly string[]
) {
  for (const row of rows) {
    chunks.push(formatCsvRow(row, keys), "\n");
  }
  return rows.length;
}

function appendJsonRows({
  chunks,
  rows,
  columns,
  keys,
  initialRowCount,
}: {
  chunks: string[];
  rows: SelectedRow[];
  columns: TableResultColumn[];
  keys: readonly string[];
  initialRowCount: number;
}) {
  let appended = 0;
  for (const row of rows) {
    chunks.push(
      initialRowCount + appended === 0 ? "\n" : ",\n",
      indentJsonChunk(
        JSON.stringify(formatJsonRecord(row, columns, keys), null, 2)
      )
    );
    appended += 1;
  }
  return appended;
}

interface AppendSqlRowsArgs {
  chunks: string[];
  columns: TableResultColumn[];
  initialRowCount: number;
  keys: readonly string[];
  rows: SelectedRow[];
  schema: string;
  table: string;
}

function appendSqlRows({
  chunks,
  columns,
  keys,
  initialRowCount,
  rows,
  schema,
  table,
}: AppendSqlRowsArgs) {
  if (columns.length === 0) {
    return 0;
  }

  let appended = 0;
  for (const row of rows) {
    if (initialRowCount + appended === 0) {
      const qualified = `${quoteSqlIdentifier(schema)}.${quoteSqlIdentifier(table)}`;
      const columnList = columns
        .map((column) => quoteSqlIdentifier(column.columnName))
        .join(", ");
      chunks.push(`INSERT INTO ${qualified} (${columnList}) VALUES\n`);
    } else {
      chunks.push(",\n");
    }

    chunks.push(formatSqlValueRow(row, keys));
    appended += 1;
  }
  return appended;
}

function hasNoSqlRows(rowCount: number, columnCount: number) {
  return rowCount === 0 || columnCount === 0;
}

function createChunkedExportBuilder(
  exportFormat: ExportFormat,
  columns: TableResultColumn[],
  resourceName: string
) {
  const { schema, table } = parseTableQualifiedName(resourceName);
  const keys = resultColumnKeys(columns);
  const normalizedFormat =
    exportFormat === "json" || exportFormat === "sql" ? exportFormat : "csv";
  const chunks: string[] = [];
  let rowCount = 0;
  let truncatedRowCount = 0;

  if (normalizedFormat === "csv") {
    chunks.push(
      columns.map((column) => escapeCsv(column.columnName)).join(","),
      "\n"
    );
  }

  if (normalizedFormat === "json") {
    chunks.push("[");
  }

  const addRows = (rows: SelectedRow[]) => {
    const nextTruncatedRowCount = countRowsWithTruncatedCells(rows, keys);
    if (nextTruncatedRowCount > 0) {
      truncatedRowCount += nextTruncatedRowCount;
      return;
    }

    if (normalizedFormat === "csv") {
      rowCount += appendCsvRows(chunks, rows, keys);
      return;
    }

    if (normalizedFormat === "json") {
      rowCount += appendJsonRows({
        chunks,
        rows,
        columns,
        keys,
        initialRowCount: rowCount,
      });
      return;
    }

    rowCount += appendSqlRows({
      chunks,
      columns,
      keys,
      initialRowCount: rowCount,
      rows,
      schema,
      table,
    });
  };
  const drainChunks = () => {
    const drained = [...chunks];
    chunks.length = 0;
    return drained;
  };

  const finish = () => {
    if (truncatedRowCount > 0) {
      return {
        ok: false,
        reason: "truncated",
        truncatedRowCount,
      } satisfies ChunkedExportResult;
    }

    switch (normalizedFormat) {
      case "csv":
        return {
          ok: true,
          payload: {
            contents: [...chunks],
            filename: buildFilename(table, "csv"),
            mimeType: "text/csv;charset=utf-8",
          },
        } satisfies ChunkedExportResult;
      case "json":
        chunks.push(rowCount === 0 ? "]\n" : "\n]\n");
        return {
          ok: true,
          payload: {
            contents: [...chunks],
            filename: buildFilename(table, "json"),
            mimeType: "application/json",
          },
        } satisfies ChunkedExportResult;
      case "sql":
        if (hasNoSqlRows(rowCount, columns.length)) {
          return {
            ok: true,
            payload: {
              contents: [`-- No rows selected for "${schema}"."${table}"\n`],
              filename: buildFilename(table, "sql"),
              mimeType: "application/sql",
            },
          } satisfies ChunkedExportResult;
        }
        chunks.push(";\n");
        return {
          ok: true,
          payload: {
            contents: [...chunks],
            filename: buildFilename(table, "sql"),
            mimeType: "application/sql",
          },
        } satisfies ChunkedExportResult;
      default:
        return {
          ok: true,
          payload: {
            contents: [...chunks],
            filename: buildFilename(table, "csv"),
            mimeType: "text/csv;charset=utf-8",
          },
        } satisfies ChunkedExportResult;
    }
  };

  return { addRows, drainChunks, finish } satisfies ChunkedExportBuilder;
}

function buildExport({
  exportFormat,
  rows,
  columns,
  resourceName,
}: {
  exportFormat: ExportFormat;
  rows: SelectedRow[];
  columns: TableResultColumn[];
  resourceName: string;
}) {
  const truncatedRowCount = countRowsWithTruncatedCells(
    rows,
    resultColumnKeys(columns)
  );
  if (truncatedRowCount > 0) {
    return {
      ok: false,
      reason: "truncated",
      truncatedRowCount,
    } satisfies ExportResult;
  }

  let payload: ExportPayload;
  switch (exportFormat) {
    case "csv":
      payload = formatRowsAsCsv(rows, columns, resourceName);
      break;
    case "json":
      payload = formatRowsAsJson(rows, columns, resourceName);
      break;
    case "sql":
      payload = formatRowsAsSql(rows, columns, resourceName);
      break;
    default:
      payload = formatRowsAsCsv(rows, columns, resourceName);
  }
  return { ok: true, payload } satisfies ExportResult;
}

export type {
  ChunkedExportPayload,
  ChunkedExportResult,
  ExportFileDetails,
  ExportFormat,
  ExportPayload,
  ExportResult,
  SelectedRow,
};
export {
  buildExport,
  createChunkedExportBuilder,
  formatCellForClipboard,
  getExportFileDetails,
  resultColumnKeys,
};
