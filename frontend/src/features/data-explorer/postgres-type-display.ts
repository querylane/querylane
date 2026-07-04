import type { Column } from "@/protogen/querylane/console/v1alpha1/table_pb";
import { DataType } from "@/protogen/querylane/console/v1alpha1/table_pb";

interface PostgresTypeDisplay {
  badges: string[];
  category: string;
  displayType: string;
  summary: string;
}

type ColumnTypeInput = Pick<
  Column,
  "characterMaximumLength" | "dataType" | "rawType"
>;

const INTEGER_META: Record<
  string,
  { bits: string; bytes: string; serial?: boolean | undefined; summary: string }
> = {
  bigint: {
    bits: "64-bit",
    bytes: "8 bytes",
    summary: "Large-range signed whole number.",
  },
  bigserial: {
    bits: "64-bit",
    bytes: "8 bytes",
    serial: true,
    summary: "Sequence-backed large-range integer shorthand.",
  },
  int: {
    bits: "32-bit",
    bytes: "4 bytes",
    summary: "Typical signed whole number.",
  },
  int2: {
    bits: "16-bit",
    bytes: "2 bytes",
    summary: "Small-range signed whole number.",
  },
  int4: {
    bits: "32-bit",
    bytes: "4 bytes",
    summary: "Typical signed whole number.",
  },
  int8: {
    bits: "64-bit",
    bytes: "8 bytes",
    summary: "Large-range signed whole number.",
  },
  integer: {
    bits: "32-bit",
    bytes: "4 bytes",
    summary: "Typical signed whole number.",
  },
  serial: {
    bits: "32-bit",
    bytes: "4 bytes",
    serial: true,
    summary: "Sequence-backed integer shorthand.",
  },
  serial2: {
    bits: "16-bit",
    bytes: "2 bytes",
    serial: true,
    summary: "Sequence-backed small integer shorthand.",
  },
  serial4: {
    bits: "32-bit",
    bytes: "4 bytes",
    serial: true,
    summary: "Sequence-backed integer shorthand.",
  },
  serial8: {
    bits: "64-bit",
    bytes: "8 bytes",
    serial: true,
    summary: "Sequence-backed large-range integer shorthand.",
  },
  smallint: {
    bits: "16-bit",
    bytes: "2 bytes",
    summary: "Small-range signed whole number.",
  },
  smallserial: {
    bits: "16-bit",
    bytes: "2 bytes",
    serial: true,
    summary: "Sequence-backed small integer shorthand.",
  },
};

const ARRAY_TYPE_PATTERN = /^(.+)\[\]$/;
const LENGTH_PATTERN = /\(\s*(\d+)\s*\)/;
const TYPE_MODIFIER_PATTERN = /\s*\(\s*-?\d+(?:\s*,\s*-?\d+)?\s*\)/g;
const WHITESPACE_PATTERN = /\s+/g;

const FIXED_CHARACTER_TYPES = new Set(["bpchar", "char", "character"]);
const VARIABLE_CHARACTER_TYPES = new Set(["varchar", "character varying"]);
const SPATIAL_TYPES = new Set([
  "box",
  "circle",
  "geography",
  "geometry",
  "line",
  "lseg",
  "path",
  "point",
  "polygon",
]);
const NETWORK_TYPES = new Set(["cidr", "inet", "macaddr", "macaddr8"]);
const OBJECT_ID_TYPES = new Set([
  "oid",
  "regclass",
  "regcollation",
  "regconfig",
  "regdictionary",
  "regnamespace",
  "regoper",
  "regoperator",
  "regproc",
  "regprocedure",
  "regrole",
  "regtype",
]);
const RANGE_TYPES = new Set([
  "daterange",
  "datemultirange",
  "int4multirange",
  "int4range",
  "int8multirange",
  "int8range",
  "nummultirange",
  "numrange",
  "tsmultirange",
  "tsrange",
  "tstzmultirange",
  "tstzrange",
]);

type TypeDisplayMeta = Omit<PostgresTypeDisplay, "badges" | "displayType"> & {
  badges?: readonly string[] | undefined;
  displayType?: string | undefined;
};

const STATIC_TYPE_META: Record<string, TypeDisplayMeta> = {
  array: {
    badges: ["array"],
    category: "Array",
    summary: "List of values; element type depends on the column definition.",
  },
  bit: {
    badges: ["fixed length"],
    category: "Bit string",
    summary: "Fixed-length bit string.",
  },
  "bit varying": {
    badges: ["variable length"],
    category: "Bit string",
    summary: "Variable-length bit string.",
  },
  bool: {
    badges: ["true/false"],
    category: "Boolean",
    summary: "Logical true or false value.",
  },
  boolean: {
    badges: ["true/false"],
    category: "Boolean",
    summary: "Logical true or false value.",
  },
  bytea: {
    badges: ["byte array"],
    category: "Binary",
    summary: "Raw binary data.",
  },
  date: {
    badges: ["4 bytes"],
    category: "Date",
    summary: "Calendar date without a time of day.",
  },
  decimal: {
    badges: ["exact", "variable precision"],
    category: "Decimal",
    summary: "Exact decimal with selectable precision and scale.",
  },
  "double precision": {
    badges: ["64-bit", "8 bytes", "approximate"],
    category: "Float",
    summary: "Double precision approximate floating-point number.",
  },
  float: {
    badges: ["64-bit", "8 bytes", "approximate"],
    category: "Float",
    summary: "Double precision approximate floating-point number.",
  },
  float4: {
    badges: ["32-bit", "4 bytes", "approximate"],
    category: "Float",
    summary: "Single precision approximate floating-point number.",
  },
  float8: {
    badges: ["64-bit", "8 bytes", "approximate"],
    category: "Float",
    summary: "Double precision approximate floating-point number.",
  },
  interval: {
    badges: ["16 bytes", "duration"],
    category: "Interval",
    summary: "Time span or duration value.",
  },
  json: {
    badges: ["text JSON"],
    category: "JSON",
    summary: "Textual JSON document stored as input text.",
  },
  jsonb: {
    badges: ["binary JSON", "decomposed"],
    category: "JSON",
    summary: "Decomposed binary JSON document.",
  },
  jsonpath: {
    badges: ["SQL/JSON"],
    category: "JSON path",
    summary: "SQL/JSON path expression.",
  },
  money: {
    badges: ["currency"],
    category: "Money",
    summary: "Currency amount; formatting depends on locale settings.",
  },
  name: {
    badges: ["identifier"],
    category: "Identifier",
    summary: "PostgreSQL internal identifier name.",
  },
  numeric: {
    badges: ["exact", "variable precision"],
    category: "Decimal",
    summary: "Exact decimal with selectable precision and scale.",
  },
  pg_lsn: {
    badges: ["WAL"],
    category: "Log sequence",
    summary: "PostgreSQL write-ahead log sequence number.",
  },
  pg_snapshot: {
    badges: ["transaction IDs"],
    category: "Snapshot",
    summary: "PostgreSQL transaction ID snapshot value.",
  },
  real: {
    badges: ["32-bit", "4 bytes", "approximate"],
    category: "Float",
    summary: "Single precision approximate floating-point number.",
  },
  text: {
    badges: ["variable length"],
    category: "Text",
    summary: "Unlimited variable-length character string.",
  },
  time: {
    badges: ["8 bytes", "no time zone"],
    category: "Time",
    summary: "Time of day without date or time zone.",
  },
  "time with time zone": {
    badges: ["timetz", "12 bytes"],
    category: "Time",
    summary: "Time of day with a stored UTC offset.",
  },
  "time without time zone": {
    badges: ["8 bytes", "no time zone"],
    category: "Time",
    summary: "Time of day without date or time zone.",
  },
  timestamp: {
    badges: ["8 bytes", "no time zone"],
    category: "Timestamp",
    summary: "Date and time without time zone conversion.",
  },
  "timestamp with time zone": {
    badges: ["timestamptz", "8 bytes"],
    category: "Timestamp",
    summary:
      "UTC-normalized instant; displayed in the current session time zone.",
  },
  "timestamp without time zone": {
    badges: ["8 bytes", "no time zone"],
    category: "Timestamp",
    summary: "Date and time without time zone conversion.",
  },
  timestamptz: {
    badges: ["timestamptz", "8 bytes"],
    category: "Timestamp",
    summary:
      "UTC-normalized instant; displayed in the current session time zone.",
  },
  timetz: {
    badges: ["timetz", "12 bytes"],
    category: "Time",
    summary: "Time of day with a stored UTC offset.",
  },
  tsquery: {
    badges: ["full-text"],
    category: "Search",
    summary: "Full-text search query.",
  },
  tsvector: {
    badges: ["full-text"],
    category: "Search",
    summary: "Full-text search document vector.",
  },
  txid_snapshot: {
    badges: ["transaction IDs"],
    category: "Snapshot",
    summary: "PostgreSQL transaction ID snapshot value.",
  },
  uuid: {
    badges: ["128-bit"],
    category: "UUID",
    summary: "Universally unique identifier.",
  },
  varbit: {
    badges: ["variable length"],
    category: "Bit string",
    summary: "Variable-length bit string.",
  },
  xml: {
    badges: ["XML"],
    category: "XML",
    summary: "XML document value.",
  },
};

function uniqueBadges(badges: readonly string[]): string[] {
  return Array.from(new Set(badges.filter(Boolean)));
}

function normalizeRawType(rawType: string): string {
  return rawType
    .trim()
    .toLowerCase()
    .replace(WHITESPACE_PATTERN, " ")
    .replace(TYPE_MODIFIER_PATTERN, "");
}

function parseTypeLength(rawType: string, characterMaximumLength: number) {
  if (characterMaximumLength > 0) {
    return characterMaximumLength;
  }
  const match = rawType.match(LENGTH_PATTERN);
  if (!match?.[1]) {
    return 0;
  }
  return Number.parseInt(match[1], 10);
}

function withDisplay(
  column: ColumnTypeInput,
  meta: TypeDisplayMeta
): PostgresTypeDisplay {
  return {
    badges: uniqueBadges(meta.badges ?? []),
    category: meta.category,
    displayType: meta.displayType ?? (column.rawType || "unknown"),
    summary: meta.summary,
  };
}

function fallbackTypeDisplay(column: ColumnTypeInput): PostgresTypeDisplay {
  switch (column.dataType) {
    case DataType.ARRAY:
      return withDisplay(column, {
        badges: ["array"],
        category: "Array",
        summary:
          "List of values; element type is not available in this catalog row.",
      });
    case DataType.BINARY:
      return withDisplay(column, {
        badges: ["byte array"],
        category: "Binary",
        summary: "Raw binary data stored as bytea.",
      });
    case DataType.BOOLEAN:
      return withDisplay(column, {
        badges: ["true/false"],
        category: "Boolean",
        summary: "Logical true or false value.",
      });
    case DataType.DATE:
      return withDisplay(column, {
        badges: ["4 bytes"],
        category: "Date",
        summary: "Calendar date without a time of day.",
      });
    case DataType.FLOAT:
      return withDisplay(column, {
        badges: ["numeric"],
        category: "Number",
        summary:
          "Numeric value. Exactness depends on the PostgreSQL type name.",
      });
    case DataType.GEOMETRY:
      return withDisplay(column, {
        badges: ["spatial"],
        category: "Spatial",
        summary: "Spatial or geometric value.",
      });
    case DataType.INTEGER:
      return withDisplay(column, {
        badges: ["integer"],
        category: "Integer",
        summary: "Signed whole number.",
      });
    case DataType.JSON:
      return withDisplay(column, {
        badges: ["JSON"],
        category: "JSON",
        summary: "JSON document value.",
      });
    case DataType.STRING:
      return withDisplay(column, {
        badges: ["text"],
        category: "Text",
        summary: "Character string value.",
      });
    case DataType.TIME:
      return withDisplay(column, {
        badges: ["time"],
        category: "Time",
        summary: "Time of day value.",
      });
    case DataType.TIMESTAMP:
      return withDisplay(column, {
        badges: ["timestamp"],
        category: "Timestamp",
        summary: "Date and time value.",
      });
    case DataType.UNKNOWN:
      return withDisplay(column, {
        badges: ["custom"],
        category: "Custom",
        summary:
          "Custom, domain, enum, extension, or unmapped PostgreSQL type.",
      });
    case DataType.UNSPECIFIED:
      return withDisplay(column, {
        category: "Unknown",
        summary: "PostgreSQL type metadata was not specified.",
      });
    case DataType.UUID:
      return withDisplay(column, {
        badges: ["128-bit"],
        category: "UUID",
        summary: "Universally unique identifier.",
      });
    default:
      return withDisplay(column, {
        category: "Unknown",
        summary: "PostgreSQL type metadata was not recognized by this client.",
      });
  }
}

function describeArrayType(
  column: ColumnTypeInput,
  normalized: string
): PostgresTypeDisplay | undefined {
  const arrayMatch = normalized.match(ARRAY_TYPE_PATTERN);
  if (!arrayMatch?.[1]) {
    return;
  }
  return withDisplay(column, {
    badges: ["array", `${arrayMatch[1]} elements`],
    category: "Array",
    summary: "List of values of the same PostgreSQL element type.",
  });
}

function describeIntegerType(
  column: ColumnTypeInput,
  normalized: string
): PostgresTypeDisplay | undefined {
  const integerMeta = INTEGER_META[normalized];
  if (!integerMeta) {
    return;
  }
  return withDisplay(column, {
    badges: [
      integerMeta.bits,
      integerMeta.bytes,
      integerMeta.serial ? "serial" : "integer",
    ],
    category: "Integer",
    summary: integerMeta.summary,
  });
}

function describeCharacterType(
  column: ColumnTypeInput,
  normalized: string
): PostgresTypeDisplay | undefined {
  const length = parseTypeLength(column.rawType, column.characterMaximumLength);
  if (FIXED_CHARACTER_TYPES.has(normalized)) {
    return withDisplay(column, {
      badges: ["fixed length", length > 0 ? `${length} chars` : "padded"],
      category: "Text",
      summary: "Fixed-length, blank-padded character string.",
    });
  }
  if (VARIABLE_CHARACTER_TYPES.has(normalized)) {
    return withDisplay(column, {
      badges: [
        "variable length",
        length > 0 ? `limit ${length} chars` : "unbounded",
      ],
      category: "Text",
      summary: "Variable-length character string.",
    });
  }
  return;
}

function describeIntervalVariantType(
  column: ColumnTypeInput,
  normalized: string
): PostgresTypeDisplay | undefined {
  if (!normalized.startsWith("interval ")) {
    return;
  }
  return withDisplay(column, {
    badges: ["16 bytes", "duration"],
    category: "Interval",
    summary: "Time span or duration value with restricted stored fields.",
  });
}

function describeNetworkType(
  column: ColumnTypeInput,
  normalized: string
): PostgresTypeDisplay | undefined {
  if (!NETWORK_TYPES.has(normalized)) {
    return;
  }
  return withDisplay(column, {
    badges: ["address"],
    category: "Network",
    summary: "Network address value such as host, CIDR block, or MAC address.",
  });
}

function describeObjectIdType(
  column: ColumnTypeInput,
  normalized: string
): PostgresTypeDisplay | undefined {
  const isInternalId = normalized === "xid" || normalized === "cid";
  if (!(OBJECT_ID_TYPES.has(normalized) || isInternalId)) {
    return;
  }
  return withDisplay(column, {
    badges: [isInternalId ? "system ID" : "system catalog"],
    category: "Object ID",
    summary: isInternalId
      ? "PostgreSQL internal transaction or command identifier."
      : "PostgreSQL system object identifier or alias type.",
  });
}

function describeRangeType(
  column: ColumnTypeInput,
  normalized: string
): PostgresTypeDisplay | undefined {
  if (!RANGE_TYPES.has(normalized)) {
    return;
  }
  return withDisplay(column, {
    badges: [normalized.includes("multirange") ? "multirange" : "range"],
    category: "Range",
    summary: "Range of scalar values with inclusive or exclusive bounds.",
  });
}

function describeSpatialType(
  column: ColumnTypeInput,
  normalized: string
): PostgresTypeDisplay | undefined {
  if (!SPATIAL_TYPES.has(normalized)) {
    return;
  }
  return withDisplay(column, {
    badges: [
      normalized === "geometry" || normalized === "geography"
        ? "PostGIS"
        : "geometric",
    ],
    category: "Spatial",
    summary: "Geometric or spatial value.",
  });
}

function describePostgresType(column: ColumnTypeInput): PostgresTypeDisplay {
  const normalized = normalizeRawType(column.rawType);
  return (
    describeArrayType(column, normalized) ??
    describeIntegerType(column, normalized) ??
    describeCharacterType(column, normalized) ??
    (STATIC_TYPE_META[normalized]
      ? withDisplay(column, STATIC_TYPE_META[normalized])
      : undefined) ??
    describeIntervalVariantType(column, normalized) ??
    describeNetworkType(column, normalized) ??
    describeObjectIdType(column, normalized) ??
    describeRangeType(column, normalized) ??
    describeSpatialType(column, normalized) ??
    fallbackTypeDisplay(column)
  );
}

export type { PostgresTypeDisplay };
export { describePostgresType };
