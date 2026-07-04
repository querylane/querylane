import { format, parseISO } from "date-fns";
import type {
  TableCell,
  TableResultColumn,
} from "@/protogen/querylane/console/v1alpha1/table_data_pb";
import { DataType } from "@/protogen/querylane/console/v1alpha1/table_pb";

type FormattedCellKind =
  | "null"
  | "array"
  | "bool"
  | "number"
  | "json"
  | "bytes"
  | "timestamp"
  | "date"
  | "text";

interface FormattedCell {
  display: string;
  isNull: boolean;
  isTruncated: boolean;
  kind: FormattedCellKind;
  timezoneLabel?: string | undefined;
}

const NULL_DISPLAY = "NULL";
const TIMESTAMP_FORMAT = "yyyy-MM-dd HH:mm:ss";
const MAX_FRACTION_DIGITS = 6;
const RFC3339_PARTS_PATTERN =
  /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.\d+)?(?:\s*(Z|[+-]\d{2}(?::?\d{2})?))?$/i;
const TIMEZONE_OFFSET_PATTERN = /^([+-])(\d{2})(?::?(\d{2}))?$/;

function formatTimezoneLabel(offset: string | undefined): string | undefined {
  if (!offset) {
    return;
  }
  const normalized = offset.toUpperCase();
  if (normalized === "Z") {
    return "UTC";
  }
  const match = normalized.match(TIMEZONE_OFFSET_PATTERN);
  if (!match) {
    return;
  }
  const [, sign, hours, minutes = "00"] = match;
  const normalizedOffset = `${sign}${hours}:${minutes}`;
  if (normalizedOffset === "+00:00" || normalizedOffset === "-00:00") {
    return "UTC";
  }
  return `UTC${normalizedOffset}`;
}

function formatTimestamp(raw: string): {
  display: string;
  timezoneLabel?: string | undefined;
} {
  if (!raw) {
    return { display: "" };
  }
  const parts = raw.match(RFC3339_PARTS_PATTERN);
  if (parts?.[1] && parts[2]) {
    const timezoneLabel = formatTimezoneLabel(parts[3]);
    return {
      display: `${parts[1]} ${parts[2]}`,
      timezoneLabel,
    };
  }
  try {
    return { display: format(parseISO(raw), TIMESTAMP_FORMAT) };
  } catch {
    return { display: raw };
  }
}

function formatNumber(value: number): string {
  if (Number.isInteger(value)) {
    return value.toString();
  }
  return value.toLocaleString(undefined, {
    maximumFractionDigits: MAX_FRACTION_DIGITS,
  });
}

function createFormattedCell({
  display,
  isTruncated,
  kind,
  timezoneLabel,
}: {
  display: string;
  isTruncated: boolean;
  kind: FormattedCellKind;
  timezoneLabel?: string | undefined;
}): FormattedCell {
  return {
    display,
    isNull: false,
    isTruncated,
    kind,
    timezoneLabel,
  };
}

function createNullCell(): FormattedCell {
  return {
    display: NULL_DISPLAY,
    isNull: true,
    isTruncated: false,
    kind: "null",
  };
}

function formatBytesCell(cell: TableCell, value: unknown): FormattedCell {
  const length = value instanceof Uint8Array ? value.length : 0;
  const fullSize = cell.fullSizeBytes;
  const bytes = fullSize > 0n ? Number(fullSize) : length;
  return createFormattedCell({
    display: `‹${bytes.toLocaleString()} bytes›`,
    isTruncated: cell.truncated === true,
    kind: "bytes",
  });
}

function formatTimestampCell(
  column: TableResultColumn,
  rawValue: unknown,
  truncated: boolean
): FormattedCell {
  const timestamp = formatTimestamp(String(rawValue ?? ""));
  const display =
    column.dataType === DataType.DATE || !timestamp.timezoneLabel
      ? timestamp.display
      : `${timestamp.display} ${timestamp.timezoneLabel}`;
  return createFormattedCell({
    display,
    isTruncated: truncated,
    kind: column.dataType === DataType.DATE ? "date" : "timestamp",
    timezoneLabel:
      column.dataType === DataType.DATE ? undefined : timestamp.timezoneLabel,
  });
}

function formatStringCell(
  column: TableResultColumn,
  rawValue: unknown,
  truncated: boolean
): FormattedCell | null {
  if (column.dataType !== DataType.ARRAY) {
    return null;
  }
  return createFormattedCell({
    display: String(rawValue ?? ""),
    isTruncated: truncated,
    kind: "array",
  });
}

function formatExtendedKnownValueCell({
  caseName,
  column,
  truncated,
  value,
}: {
  caseName: string;
  column: TableResultColumn;
  truncated: boolean;
  value: unknown;
}): FormattedCell | null {
  switch (caseName) {
    case "jsonValue":
      return createFormattedCell({
        display: String(value ?? ""),
        isTruncated: truncated,
        kind: "json",
      });
    case "timestampValue":
      return formatTimestampCell(column, value, truncated);
    case "stringValue":
      return formatStringCell(column, value, truncated);
    default:
      return null;
  }
}

function formatKnownValueCell(
  cell: TableCell,
  column: TableResultColumn
): FormattedCell | null {
  const kind = cell.value?.kind;
  if (!kind || kind.case === "nullValue") {
    return null;
  }

  const value = kind.value;
  const truncated = cell.truncated === true;

  switch (kind.case) {
    case "boolValue":
      return createFormattedCell({
        display: value === true ? "true" : "false",
        isTruncated: false,
        kind: "bool",
      });
    case "bytesValue":
      return formatBytesCell(cell, value);
    case "doubleValue":
      return createFormattedCell({
        display:
          typeof value === "number" ? formatNumber(value) : String(value),
        isTruncated: false,
        kind: "number",
      });
    case "int64Value":
      return createFormattedCell({
        display: typeof value === "bigint" ? value.toString() : String(value),
        isTruncated: false,
        kind: "number",
      });
    case "numericValue":
      return createFormattedCell({
        display: String(value ?? ""),
        isTruncated: truncated,
        kind: "number",
      });
    default:
      return formatExtendedKnownValueCell({
        caseName: kind.case ?? "",
        column,
        truncated,
        value,
      });
  }
}

function formatTableCell(
  cell: TableCell | undefined,
  column: TableResultColumn
): FormattedCell {
  const kindCase = cell?.value?.kind.case;

  if (!cell || kindCase === undefined || kindCase === "nullValue") {
    return createNullCell();
  }

  return (
    formatKnownValueCell(cell, column) ??
    createFormattedCell({
      display: String(cell.value?.kind.value ?? ""),
      isTruncated: cell.truncated === true,
      kind: "text",
    })
  );
}

export type { FormattedCell };
export { formatTableCell };
