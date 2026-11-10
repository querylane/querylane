import { fromJson } from "@bufbuild/protobuf";
import { TimestampSchema } from "@bufbuild/protobuf/wkt";
import { comparePrimitive, type ListSort } from "@/lib/list-layout";
import type {
  TableCell,
  TableResultColumn,
  TableResultRow,
} from "@/protogen/querylane/console/v1alpha1/table_data_pb";

const DECIMAL =
  /^(?<sign>[+-]?)(?<integer>\d*)(?:\.(?<fraction>\d*))?(?:[eE](?<exponent>[+-]?\d+))?$/u;
const LEADING_ZEROES = /^0+/u;
const TRAILING_ZEROES = /0+$/u;
const DATE = /^\d{4}-\d{2}-\d{2}$/u;
const TIME = /^\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})?$/u;
const TIME_ZONE = /(?:Z|[+-]\d{2}:\d{2})$/u;
const SPECIAL_NUMERIC_RANK: Record<string, number> = {
  "-Infinity": -1,
  Infinity: 1,
  NaN: 2,
};
function decimalParts(value: string) {
  const groups = DECIMAL.exec(value)?.groups;
  if (!groups) {
    return null;
  }
  const integer = groups["integer"] ?? "";
  const digits = integer + (groups["fraction"] ?? "");
  if (digits.length === 0) {
    return null;
  }
  const exponent = Number(groups["exponent"] ?? 0);
  if (!Number.isSafeInteger(exponent)) {
    return null;
  }
  const significant = digits.replace(LEADING_ZEROES, "");
  return {
    negative: significant.length > 0 && groups["sign"] === "-",
    magnitude:
      significant.length === 0
        ? 0
        : integer.length - (digits.length - significant.length) + exponent,
    digits: significant.replace(TRAILING_ZEROES, "") || "0",
  };
}
function compareMagnitude(
  a: NonNullable<ReturnType<typeof decimalParts>>,
  b: NonNullable<ReturnType<typeof decimalParts>>
) {
  if (a.digits === "0" && b.digits !== "0") {
    return -1;
  }
  if (b.digits === "0" && a.digits !== "0") {
    return 1;
  }
  const length = Math.max(a.digits.length, b.digits.length);
  return (
    a.magnitude - b.magnitude ||
    comparePrimitive(a.digits.padEnd(length, "0"), b.digits.padEnd(length, "0"))
  );
}
function compareDecimal(left: string, right: string) {
  const a = decimalParts(left);
  const b = decimalParts(right);
  if (!(a && b)) {
    return (
      (SPECIAL_NUMERIC_RANK[left] ?? 0) - (SPECIAL_NUMERIC_RANK[right] ?? 0) ||
      left.localeCompare(right)
    );
  }
  if (a.negative !== b.negative) {
    return a.negative ? -1 : 1;
  }
  const compared = compareMagnitude(a, b);
  return a.negative ? -compared : compared;
}
function cellValue(cell: TableCell | undefined) {
  const value = cell?.value?.kind;
  return value?.case === "nullValue" || value?.case === undefined
    ? undefined
    : value;
}
type CellValue = NonNullable<ReturnType<typeof cellValue>>;

function compareBytes(a: Uint8Array, b: Uint8Array) {
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    const compared = (a[i] ?? 0) - (b[i] ?? 0);
    if (compared !== 0) {
      return compared;
    }
  }
  return a.length - b.length;
}
function temporalParts(value: string) {
  let timestamp = value;
  if (DATE.test(value)) {
    timestamp = `${value}T00:00:00`;
  } else if (TIME.test(value)) {
    timestamp = `1970-01-01T${value}`;
  }
  // Zone-free SQL values are wall-clock values, independent of the browser zone.
  if (!TIME_ZONE.test(timestamp)) {
    timestamp += "Z";
  }
  try {
    return fromJson(TimestampSchema, timestamp);
  } catch {
    return undefined;
  }
}
function compareTemporal(left: string, right: string) {
  const a = temporalParts(left);
  const b = temporalParts(right);
  if (a && b) {
    return (
      comparePrimitive(a.seconds, b.seconds) ||
      comparePrimitive(a.nanos, b.nanos)
    );
  }
  // Unsupported formats/ranges form a separate text-sorted bucket, keeping a
  // total order even when valid timestamps use different timezone offsets.
  if (a || b) {
    return a ? -1 : 1;
  }
  return left.localeCompare(right, "en", { numeric: true });
}
function compareRawValues(a: CellValue["value"], b: CellValue["value"]) {
  if (a instanceof Uint8Array && b instanceof Uint8Array) {
    return compareBytes(a, b);
  }
  if (typeof a === "string" && typeof b === "string") {
    return a.localeCompare(b, "en", { numeric: true });
  }
  if (a instanceof Uint8Array || b instanceof Uint8Array) {
    return 0;
  }
  return comparePrimitive(a, b);
}
function compareCellValues(a: CellValue, b: CellValue) {
  if (a.case === "timestampValue" && b.case === "timestampValue") {
    return compareTemporal(a.value, b.value);
  }
  if (a.case === "doubleValue" && b.case === "doubleValue") {
    return (
      Number(Number.isNaN(a.value)) - Number(Number.isNaN(b.value)) ||
      comparePrimitive(a.value, b.value)
    );
  }
  if (a.case === "numericValue" && b.case === "numericValue") {
    return compareDecimal(a.value, b.value);
  }
  return compareRawValues(a.value, b.value);
}
function compareCells(
  left: TableCell | undefined,
  right: TableCell | undefined,
  descending: boolean
) {
  const a = cellValue(left);
  const b = cellValue(right);
  if (a === undefined && b !== undefined) {
    return 1;
  }
  if (b === undefined && a !== undefined) {
    return -1;
  }
  if (!(a && b)) {
    return 0;
  }
  const compared = compareCellValues(a, b);
  return descending ? -compared : compared;
}

// Presentation sort of the received result only; never wraps or executes SQL.
// This is not a promise to reproduce PostgreSQL collations or hidden full values.
function sortSqlResultRows(
  rows: readonly TableResultRow[],
  columns: readonly TableResultColumn[],
  sorting: readonly ListSort[]
) {
  const indexes = new Map(
    columns.map((column, index) => [column.columnName, index])
  );
  const comparisons = sorting.flatMap((sort) => {
    const index = indexes.get(sort.id);
    return index === undefined
      ? []
      : [
          (a: TableResultRow, b: TableResultRow) =>
            compareCells(a.values[index], b.values[index], sort.desc),
        ];
  });
  return rows.toSorted((a, b) => {
    for (const compare of comparisons) {
      const result = compare(a, b);
      if (result !== 0) {
        return result;
      }
    }
    return 0;
  });
}

export { sortSqlResultRows };
