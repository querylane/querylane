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

// countRowsWithTruncatedCells reports how many selected rows have at least
// one cell where the server-returned preview was truncated. Exports refuse
// to serialise such rows: the displayed cell is a prefix, and writing it
// into a CSV/SQL/JSON payload would produce a silently-corrupt artifact
// (especially the SQL INSERT, which looks authoritative).
function countRowsWithTruncatedCells(
  rows: SelectedRow[],
  columns: TableResultColumn[]
): number {
  let count = 0;
  for (const row of rows) {
    for (const column of columns) {
      if (row.cells.get(column.columnName)?.truncated === true) {
        count++;
        break;
      }
    }
  }
  return count;
}

const FILENAME_DATE_FORMAT = "yyyy-MM-dd";
const SAFE_FILENAME_PATTERN = /[^a-zA-Z0-9_.-]+/g;
const SQL_NUMERIC_PATTERN = /^-?\d+(?:\.\d+)?$/;
const CSV_FORMULA_PREFIX_PATTERN = /^[=+\-@\t\r]/;
const CSV_QUOTE_REQUIRED_PATTERN = /[",\n\r]/;
const CSV_QUOTE_PATTERN = /"/g;
const SQL_QUOTE_PATTERN = /'/g;
const SQL_IDENTIFIER_QUOTE_PATTERN = /"/g;

function buildFilename(table: string, ext: string): string {
  const date = format(new Date(), FILENAME_DATE_FORMAT);
  const safeTable = table.replace(SAFE_FILENAME_PATTERN, "_") || "table";
  return `${safeTable}_${date}.${ext}`;
}

function getExportFileDetails(
  exportFormat: ExportFormat,
  resourceName: string
): ExportFileDetails {
  const { table } = parseTableQualifiedName(resourceName);
  switch (exportFormat) {
    case "json":
      return {
        extensions: [".json"],
        filename: buildFilename(table, "json"),
        mimeType: "application/json",
      };
    case "sql":
      return {
        extensions: [".sql"],
        filename: buildFilename(table, "sql"),
        mimeType: "application/sql",
      };
    default:
      return {
        extensions: [".csv"],
        filename: buildFilename(table, "csv"),
        mimeType: "text/csv;charset=utf-8",
      };
  }
}

function escapeCsv(value: string, neutralizeFormula = true): string {
  const safeValue =
    neutralizeFormula && CSV_FORMULA_PREFIX_PATTERN.test(value)
      ? `'${value}`
      : value;
  if (safeValue === "" || CSV_QUOTE_REQUIRED_PATTERN.test(safeValue)) {
    return `"${safeValue.replace(CSV_QUOTE_PATTERN, '""')}"`;
  }
  return safeValue;
}

// Exports serialise the RAW TableCell value, never the on-screen display
// string: the display formatter applies locale grouping, rounds doubles to
// six fraction digits, and reformats timestamps into the local time zone —
// all of which would silently corrupt CSV/SQL/JSON artifacts.
type RawCellValue =
  | { kind: "bool"; value: boolean }
  | { kind: "null" }
  | { kind: "number"; text: string }
  | { kind: "text"; text: string };

const BYTE_HEX_WIDTH = 2;
const HEX_RADIX = 16;

function bytesToPostgresHex(bytes: Uint8Array): string {
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(HEX_RADIX).padStart(BYTE_HEX_WIDTH, "0");
  }
  return `\\x${hex}`;
}

function rawCellValue(cell: TableCell | undefined): RawCellValue {
  const kind = cell?.value?.kind;
  if (!kind || kind.case === "nullValue") {
    return { kind: "null" };
  }
  switch (kind.case) {
    case "boolValue":
      return { kind: "bool", value: kind.value === true };
    case "bytesValue":
      return { kind: "text", text: bytesToPostgresHex(kind.value) };
    case "doubleValue":
      // String() keeps full IEEE-754 precision with no locale formatting.
      return { kind: "number", text: String(kind.value) };
    case "int64Value":
      return { kind: "number", text: kind.value.toString() };
    case "numericValue":
      return { kind: "number", text: String(kind.value ?? "") };
    case "jsonValue":
      return { kind: "text", text: String(kind.value ?? "") };
    case "timestampValue":
      // Keep the server-provided string: offset and sub-second precision
      // must survive the round trip.
      return { kind: "text", text: String(kind.value ?? "") };
    case "stringValue":
      return { kind: "text", text: kind.value };
    default:
      return { kind: "text", text: String(kind.value ?? "") };
  }
}

function rawCellText(value: RawCellValue): string {
  switch (value.kind) {
    case "null":
      return "";
    case "bool":
      return value.value ? "true" : "false";
    default:
      return value.text;
  }
}

function formatCellForClipboard(cell: TableCell | undefined): string {
  return rawCellText(rawCellValue(cell));
}

function formatCsvRow(row: SelectedRow, columns: TableResultColumn[]): string {
  const cells = columns.map((column) => {
    const raw = rawCellValue(row.cells.get(column.columnName));
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
): ExportPayload {
  const { table } = parseTableQualifiedName(resourceName);
  const header = columns
    .map((column) => escapeCsv(column.columnName))
    .join(",");
  const lines = [header];
  for (const row of rows) {
    lines.push(formatCsvRow(row, columns));
  }
  return {
    contents: `${lines.join("\n")}\n`,
    filename: buildFilename(table, "csv"),
    mimeType: "text/csv;charset=utf-8",
  };
}

function formatJsonRecord(
  row: SelectedRow,
  columns: TableResultColumn[]
): Record<string, string | boolean | null> {
  const record: Record<string, string | boolean | null> = {};
  for (const column of columns) {
    const raw = rawCellValue(row.cells.get(column.columnName));
    if (raw.kind === "null") {
      record[column.columnName] = null;
    } else if (raw.kind === "bool") {
      record[column.columnName] = raw.value;
    } else {
      // Numbers stay strings: int64 and numeric values can exceed the
      // precision a JSON number (IEEE-754 double) can represent.
      record[column.columnName] = raw.text;
    }
  }
  return record;
}

function formatRowsAsJson(
  rows: SelectedRow[],
  columns: TableResultColumn[],
  resourceName: string
): ExportPayload {
  const { table } = parseTableQualifiedName(resourceName);
  const records = rows.map((row) => formatJsonRecord(row, columns));
  return {
    contents: `${JSON.stringify(records, null, 2)}\n`,
    filename: buildFilename(table, "json"),
    mimeType: "application/json",
  };
}

function quoteSqlIdentifier(identifier: string): string {
  return `"${identifier.replace(SQL_IDENTIFIER_QUOTE_PATTERN, '""')}"`;
}

function formatSqlLiteral(cell: TableCell | undefined): string {
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
  // Exponent and special float forms ("1e+30", "NaN") plus every text kind
  // are quoted; PostgreSQL accepts them as typed literals.
  return `'${raw.text.replace(SQL_QUOTE_PATTERN, "''")}'`;
}

function formatSqlValueRow(
  row: SelectedRow,
  columns: TableResultColumn[]
): string {
  const literals = columns
    .map((column) => formatSqlLiteral(row.cells.get(column.columnName)))
    .join(", ");
  return `  (${literals})`;
}

function formatRowsAsSql(
  rows: SelectedRow[],
  columns: TableResultColumn[],
  resourceName: string
): ExportPayload {
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
    };
  }

  const valueLines = rows.map((row) => formatSqlValueRow(row, columns));

  const contents = `INSERT INTO ${qualified} (${columnList}) VALUES\n${valueLines.join(
    ",\n"
  )};\n`;
  return {
    contents,
    filename: buildFilename(table, "sql"),
    mimeType: "application/sql",
  };
}

function indentJsonChunk(json: string): string {
  return json
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");
}

function appendCsvRows(
  chunks: string[],
  rows: SelectedRow[],
  columns: TableResultColumn[]
): number {
  for (const row of rows) {
    chunks.push(formatCsvRow(row, columns));
    chunks.push("\n");
  }
  return rows.length;
}

function appendJsonRows(
  chunks: string[],
  rows: SelectedRow[],
  columns: TableResultColumn[],
  initialRowCount: number
): number {
  let appended = 0;
  for (const row of rows) {
    chunks.push(initialRowCount + appended === 0 ? "\n" : ",\n");
    chunks.push(
      indentJsonChunk(JSON.stringify(formatJsonRecord(row, columns), null, 2))
    );
    appended++;
  }
  return appended;
}

interface AppendSqlRowsArgs {
  chunks: string[];
  columns: TableResultColumn[];
  initialRowCount: number;
  rows: SelectedRow[];
  schema: string;
  table: string;
}

function appendSqlRows({
  chunks,
  columns,
  initialRowCount,
  rows,
  schema,
  table,
}: AppendSqlRowsArgs): number {
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

    chunks.push(formatSqlValueRow(row, columns));
    appended++;
  }
  return appended;
}

function createChunkedExportBuilder(
  exportFormat: ExportFormat,
  columns: TableResultColumn[],
  resourceName: string
): ChunkedExportBuilder {
  const { schema, table } = parseTableQualifiedName(resourceName);
  const normalizedFormat =
    exportFormat === "json" || exportFormat === "sql" ? exportFormat : "csv";
  const chunks: string[] = [];
  let rowCount = 0;
  let truncatedRowCount = 0;

  if (normalizedFormat === "csv") {
    chunks.push(
      columns.map((column) => escapeCsv(column.columnName)).join(",")
    );
    chunks.push("\n");
  }

  if (normalizedFormat === "json") {
    chunks.push("[");
  }

  const addRows = (rows: SelectedRow[]) => {
    const nextTruncatedRowCount = countRowsWithTruncatedCells(rows, columns);
    if (nextTruncatedRowCount > 0) {
      truncatedRowCount += nextTruncatedRowCount;
      return;
    }

    if (normalizedFormat === "csv") {
      rowCount += appendCsvRows(chunks, rows, columns);
      return;
    }

    if (normalizedFormat === "json") {
      rowCount += appendJsonRows(chunks, rows, columns, rowCount);
      return;
    }

    rowCount += appendSqlRows({
      chunks,
      columns,
      initialRowCount: rowCount,
      rows,
      schema,
      table,
    });
  };
  const drainChunks = (): BlobPart[] => {
    const drained = [...chunks];
    chunks.length = 0;
    return drained;
  };

  const finish = (): ChunkedExportResult => {
    if (truncatedRowCount > 0) {
      return { ok: false, reason: "truncated", truncatedRowCount };
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
        };
      case "json":
        chunks.push(rowCount === 0 ? "]\n" : "\n]\n");
        return {
          ok: true,
          payload: {
            contents: [...chunks],
            filename: buildFilename(table, "json"),
            mimeType: "application/json",
          },
        };
      case "sql":
        if (rowCount === 0 || columns.length === 0) {
          return {
            ok: true,
            payload: {
              contents: [`-- No rows selected for "${schema}"."${table}"\n`],
              filename: buildFilename(table, "sql"),
              mimeType: "application/sql",
            },
          };
        }
        chunks.push(";\n");
        return {
          ok: true,
          payload: {
            contents: [...chunks],
            filename: buildFilename(table, "sql"),
            mimeType: "application/sql",
          },
        };
      default:
        return {
          ok: true,
          payload: {
            contents: [...chunks],
            filename: buildFilename(table, "csv"),
            mimeType: "text/csv;charset=utf-8",
          },
        };
    }
  };

  return { addRows, drainChunks, finish };
}

function buildExport(
  exportFormat: ExportFormat,
  rows: SelectedRow[],
  columns: TableResultColumn[],
  resourceName: string
): ExportResult {
  const truncatedRowCount = countRowsWithTruncatedCells(rows, columns);
  if (truncatedRowCount > 0) {
    return { ok: false, reason: "truncated", truncatedRowCount };
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
  return { ok: true, payload };
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
};
