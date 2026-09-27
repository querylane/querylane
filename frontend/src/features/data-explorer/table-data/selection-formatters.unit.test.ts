import { create } from "@bufbuild/protobuf";
import { describe, expect, test } from "@rstest/core";

import {
  TableCellSchema,
  TableResultColumnSchema,
  TableValueSchema,
} from "@/protogen/querylane/console/v1alpha1/table_data_pb";
import { DataType } from "@/protogen/querylane/console/v1alpha1/table_pb";

import {
  buildExport,
  createChunkedExportBuilder,
  type ExportResult,
  type SelectedRow,
} from "./selection-formatters";

const RESOURCE = "instances/i/databases/d/schemas/public/tables/events";

const DANGEROUS_CSV_VALUES = [
  { input: "=1+1", output: "'=1+1" },
  { input: "+1", output: "'+1" },
  { input: "-1", output: "'-1" },
  { input: "@SUM(A1)", output: "'@SUM(A1)" },
  { input: "\t=1+1", output: "'\t=1+1" },
  { input: "\r=1+1", output: '"\'\r=1+1"' },
] as const;

function stringCell(value: string, truncated = false) {
  return create(TableCellSchema, {
    truncated,
    value: create(TableValueSchema, {
      kind: { case: "stringValue", value },
    }),
  });
}

function nullCell() {
  return create(TableCellSchema, {
    value: create(TableValueSchema, {
      kind: { case: "nullValue", value: 0 },
    }),
  });
}

function nameColumn(name: string) {
  return create(TableResultColumnSchema, {
    columnName: name,
    dataType: DataType.STRING,
    rawType: "text",
  });
}

function row(
  cells: Record<string, ReturnType<typeof stringCell>>
): SelectedRow {
  return { cells: new Map(Object.entries(cells)) };
}

describe("buildExport", () => {
  const columns = [nameColumn("id"), nameColumn("body")];

  test("counts a row only once even when multiple cells in it are truncated", () => {
    const rows: SelectedRow[] = [
      row({
        body: stringCell("trunc", true),
        id: stringCell("1", true),
      }),
    ];

    const result = buildExport({
      exportFormat: "csv",
      rows,
      columns,
      resourceName: RESOURCE,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.truncatedRowCount).toBe(1);
  });
});

describe("buildExport formatting", () => {
  test("exports booleans, nulls, quotes, and numeric literals as SQL", () => {
    const columns = [
      nameColumn('id"col'),
      nameColumn("active"),
      nameColumn("note"),
      nameColumn("missing"),
    ];
    const rows: SelectedRow[] = [
      row({
        active: create(TableCellSchema, {
          value: create(TableValueSchema, {
            kind: { case: "boolValue", value: true },
          }),
        }),
        'id"col': create(TableCellSchema, {
          value: create(TableValueSchema, {
            kind: { case: "int64Value", value: 7n },
          }),
        }),
        note: stringCell("Bob's value"),
      }),
    ];

    const result = buildExport({
      exportFormat: "sql",
      rows,
      columns,
      resourceName: RESOURCE,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.payload.contents).toBe(
      'INSERT INTO "public"."events" ("id""col", "active", "note", "missing") VALUES\n' +
        "  (7, TRUE, 'Bob''s value', NULL);\n"
    );
    expect(result.payload.mimeType).toBe("application/sql");
  });

  test("exports JSON with booleans and nulls as typed values", () => {
    const columns = [
      nameColumn("active"),
      nameColumn("note"),
      nameColumn("missing"),
    ];
    const rows: SelectedRow[] = [
      row({
        active: create(TableCellSchema, {
          value: create(TableValueSchema, {
            kind: { case: "boolValue", value: false },
          }),
        }),
        note: stringCell("hello"),
      }),
    ];

    const result = buildExport({
      exportFormat: "json",
      rows,
      columns,
      resourceName: RESOURCE,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(JSON.parse(result.payload.contents)).toEqual([
      { active: false, missing: null, note: "hello" },
    ]);
    expect(result.payload.mimeType).toBe("application/json");
  });
});

describe("buildExport raw value fidelity", () => {
  function doubleCell(value: number) {
    return create(TableCellSchema, {
      value: create(TableValueSchema, {
        kind: { case: "doubleValue", value },
      }),
    });
  }

  function timestampCell(value: string) {
    return create(TableCellSchema, {
      value: create(TableValueSchema, {
        kind: { case: "timestampValue", value },
      }),
    });
  }

  function typedColumn(name: string, dataType: DataType, rawType: string) {
    return create(TableResultColumnSchema, {
      columnName: name,
      dataType,
      rawType,
    });
  }

  test("preserves typed negative numbers in CSV", () => {
    const columns = [typedColumn("amount", DataType.FLOAT, "double precision")];
    const rows: SelectedRow[] = [row({ amount: doubleCell(-1.5) })];

    const csv = buildExport({
      exportFormat: "csv",
      rows,
      columns,
      resourceName: RESOURCE,
    });

    expect(csv.ok && csv.payload.contents).toBe("amount\n-1.5\n");
  });

  test("exports timestamps with the original offset and sub-second precision", () => {
    const raw = "2024-03-05T17:30:15.123456+05:30";
    const columns = [
      typedColumn("created_at", DataType.TIMESTAMP, "timestamptz"),
    ];
    const rows: SelectedRow[] = [row({ created_at: timestampCell(raw) })];

    const csv = buildExport({
      exportFormat: "csv",
      rows,
      columns,
      resourceName: RESOURCE,
    });
    const sql = buildExport({
      exportFormat: "sql",
      rows,
      columns,
      resourceName: RESOURCE,
    });
    const json = buildExport({
      exportFormat: "json",
      rows,
      columns,
      resourceName: RESOURCE,
    });

    expect(csv.ok && csv.payload.contents).toBe(`created_at\n${raw}\n`);
    expect(sql.ok && sql.payload.contents).toContain(`('${raw}')`);
    expect(json.ok && JSON.parse(json.payload.contents)).toEqual([
      { created_at: raw },
    ]);
  });
});

describe("buildExport edge cases", () => {
  test("SQL export returns a comment when no rows are selected", () => {
    const result = buildExport({
      exportFormat: "sql",
      rows: [],
      columns: [nameColumn("id")],
      resourceName: RESOURCE,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.payload.contents).toBe(
      '-- No rows selected for "public"."events"\n'
    );
  });

  test("unknown export formats fall back to CSV", () => {
    const result: ExportResult = Reflect.apply(buildExport, undefined, [
      {
        exportFormat: "xml",
        rows: [row({ body: stringCell("hello"), id: stringCell("1") })],
        columns: [nameColumn("id"), nameColumn("body")],
        resourceName: RESOURCE,
      },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.payload.mimeType).toBe("text/csv;charset=utf-8");
  });
});

describe("createChunkedExportBuilder", () => {
  const columns = [nameColumn("id"), nameColumn("body")];

  test("preserves SQL NULL and empty strings in CSV chunks", () => {
    const builder = createChunkedExportBuilder("csv", columns, RESOURCE);

    builder.addRows([
      row({ body: nullCell(), id: stringCell("1") }),
      row({ body: stringCell(""), id: stringCell("2") }),
    ]);

    const result = builder.finish();

    expect(result.ok && result.payload.contents).toEqual([
      "id,body",
      "\n",
      "1,",
      "\n",
      '2,""',
      "\n",
    ]);
  });

  test("neutralizes spreadsheet formulas in CSV chunks", () => {
    const builder = createChunkedExportBuilder(
      "csv",
      [nameColumn("value")],
      RESOURCE
    );

    builder.addRows(
      DANGEROUS_CSV_VALUES.map(({ input }) => row({ value: stringCell(input) }))
    );

    const result = builder.finish();

    expect(result.ok && result.payload.contents).toEqual([
      "value",
      "\n",
      ...DANGEROUS_CSV_VALUES.flatMap(({ output }) => [output, "\n"]),
    ]);
  });

  test("emits parseable JSON chunks", () => {
    const builder = createChunkedExportBuilder("json", columns, RESOURCE);

    builder.addRows([row({ body: stringCell("hello"), id: stringCell("1") })]);

    const result = builder.finish();

    expect(result.ok && JSON.parse(result.payload.contents.join(""))).toEqual([
      { body: "hello", id: "1" },
    ]);
  });
});
