import { create } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";
import { buildForeignKeyReferencePreview } from "@/components/data-grid/table-data-grid/foreign-key-reference-state";
import { ROW_KEY_FIELD } from "@/components/data-grid/table-data-grid/grid-row-model";
import {
  TableCellSchema,
  TableResultColumnSchema,
  type TableValue,
  TableValueSchema,
} from "@/protogen/querylane/console/v1alpha1/table_data_pb";
import { DataType } from "@/protogen/querylane/console/v1alpha1/table_pb";

const TARGET_TABLE =
  "instances/prod/databases/app/schemas/public/tables/accounts";

function buildPreview(
  kind: TableValue["kind"],
  targetTableName = TARGET_TABLE
) {
  const column = create(TableResultColumnSchema, {
    columnName: "account_id",
    dataType: DataType.STRING,
    rawType: "text",
  });
  return buildForeignKeyReferencePreview({
    reference: {
      constraintName: "events_account_id_fkey",
      sourceColumns: ["account_id"],
      targetColumns: ["id"],
      targetTableName,
    },
    resultColumns: [column],
    row: {
      [ROW_KEY_FIELD]: "event-1",
      cells: new Map([
        [
          "account_id",
          create(TableCellSchema, {
            value: create(TableValueSchema, { kind }),
          }),
        ],
      ]),
    },
    sourceColumn: "account_id",
  });
}

describe("foreign key reference state", () => {
  it.each([
    {
      label: "whitespace-bearing text",
      value: { case: "stringValue", value: " tenant-a " } as const,
    },
    {
      label: "arbitrary-precision numeric",
      value: { case: "numericValue", value: "9007199254740993" } as const,
    },
    {
      label: "binary foreign key",
      value: {
        case: "bytesValue",
        value: new Uint8Array([0xde, 0xad, 0xbe, 0xef]),
      } as const,
    },
  ])("preserves $label in the required predicate", ({ value }) => {
    const preview = buildPreview(value);

    expect(preview?.requiredFilter.node).toMatchObject({
      case: "group",
      value: {
        children: [
          {
            node: {
              case: "predicate",
              value: {
                column: "id",
                values: [{ kind: value }],
              },
            },
          },
        ],
      },
    });
  });

  it("rejects malformed target resource names", () => {
    expect(
      buildPreview(
        { case: "stringValue", value: "tenant-a" },
        "public.accounts"
      )
    ).toBeUndefined();
  });
});
