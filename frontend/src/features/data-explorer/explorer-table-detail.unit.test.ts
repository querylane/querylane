import { create } from "@bufbuild/protobuf";
import { describe, expect, test } from "@rstest/core";
import { deriveColumnRows } from "@/features/data-explorer/explorer-column-rows";
import {
  filterColumnDetailRows,
  filterIndexesByMethod,
  filterPoliciesByMode,
  filterTableTriggers,
} from "@/features/data-explorer/explorer-table-detail-filters";
import {
  ColumnSchema,
  ConstraintType,
  DataType,
  IdentityGeneration,
  PolicyMode,
  TableConstraintSchema,
  TableIndexSchema,
  TablePolicySchema,
  TableTriggerSchema,
} from "@/protogen/querylane/console/v1alpha1/table_pb";

function column(columnName: string) {
  return create(ColumnSchema, { columnName });
}

function foreignKey({
  columnNames,
  referencedColumnNames,
  referencedTable,
}: {
  columnNames: string[];
  referencedColumnNames: string[];
  referencedTable: string;
}) {
  return create(TableConstraintSchema, {
    columnNames,
    referencedColumnNames,
    referencedTable,
    type: ConstraintType.FOREIGN_KEY,
  });
}

describe("deriveColumnRows foreign keys", () => {
  test("lists every target when a column participates in multiple foreign keys", () => {
    const rows = deriveColumnRows(
      [column("tenant_id")],
      [
        foreignKey({
          columnNames: ["tenant_id"],
          referencedColumnNames: ["id"],
          referencedTable:
            "instances/i/databases/d/schemas/public/tables/tenants",
        }),
        foreignKey({
          columnNames: ["tenant_id"],
          referencedColumnNames: ["tenant_id"],
          referencedTable:
            "instances/i/databases/d/schemas/public/tables/billing_accounts",
        }),
      ],
      []
    );

    expect(rows[0]?.fks).toEqual([
      { column: "id", table: "public.tenants" },
      { column: "tenant_id", table: "public.billing_accounts" },
    ]);
  });
});

describe("table detail facet filters", () => {
  test("filters columns by unique, index, nullability, default, and generation", () => {
    const rows = deriveColumnRows(
      [
        create(ColumnSchema, {
          columnName: "id",
          dataType: DataType.INTEGER,
          identityGeneration: IdentityGeneration.BY_DEFAULT,
          isIdentity: true,
          isPrimaryKey: true,
          rawType: "int8",
        }),
        create(ColumnSchema, {
          columnName: "reference",
          dataType: DataType.STRING,
          isUnique: true,
          rawType: "text",
        }),
        create(ColumnSchema, {
          columnName: "status",
          dataType: DataType.STRING,
          defaultValue: "'pending'::text",
          rawType: "text",
        }),
        create(ColumnSchema, {
          columnName: "total_with_tax",
          dataType: DataType.FLOAT,
          isGenerated: true,
          rawType: "numeric(12,2)",
        }),
        create(ColumnSchema, {
          columnName: "notes",
          dataType: DataType.STRING,
          isNullable: true,
          rawType: "text",
        }),
      ],
      [],
      [
        create(TableIndexSchema, {
          indexName: "orders_reference_key",
          isUnique: true,
          keyColumns: ["reference"],
        }),
        create(TableIndexSchema, {
          indexName: "orders_status_index",
          keyColumns: ["status"],
        }),
      ]
    );

    expect(
      filterColumnDetailRows(rows, { keyKinds: ["unique"] }).map(
        (row) => row.column.columnName
      )
    ).toEqual(["reference"]);
    expect(
      filterColumnDetailRows(rows, { keyKinds: ["index"] }).map(
        (row) => row.column.columnName
      )
    ).toEqual(["status"]);
    expect(
      filterColumnDetailRows(rows, { nullability: ["nullable"] }).map(
        (row) => row.column.columnName
      )
    ).toEqual(["notes"]);
    expect(
      filterColumnDetailRows(rows, { defaultKinds: ["has-default"] }).map(
        (row) => row.column.columnName
      )
    ).toEqual(["status"]);
    expect(
      filterColumnDetailRows(rows, { generationKinds: ["identity"] }).map(
        (row) => row.column.columnName
      )
    ).toEqual(["id"]);
    expect(
      filterColumnDetailRows(rows, { generationKinds: ["generated"] }).map(
        (row) => row.column.columnName
      )
    ).toEqual(["total_with_tax"]);
    expect(
      filterColumnDetailRows(rows, {
        defaultKinds: ["no-default"],
        generationKinds: ["regular"],
        nullability: ["nullable"],
        typeCategories: ["Text"],
      }).map((row) => row.column.columnName)
    ).toEqual(["notes"]);
  });

  test("filters metadata rows by index method and policy mode", () => {
    expect(
      filterIndexesByMethod(
        [
          create(TableIndexSchema, {
            indexName: "idx_gin",
            method: "gin",
          }),
          create(TableIndexSchema, {
            indexName: "idx_btree",
            method: "btree",
          }),
        ],
        ["gin"]
      ).map((index) => index.indexName)
    ).toEqual(["idx_gin"]);

    expect(
      filterPoliciesByMode(
        [
          create(TablePolicySchema, {
            mode: PolicyMode.PERMISSIVE,
            policyName: "policy_permissive",
          }),
          create(TablePolicySchema, {
            mode: PolicyMode.RESTRICTIVE,
            policyName: "policy_restrictive",
          }),
        ],
        [PolicyMode.RESTRICTIVE]
      ).map((policy) => policy.policyName)
    ).toEqual(["policy_restrictive"]);
  });

  test("filters triggers by name and enabled state", () => {
    const triggers = [
      create(TableTriggerSchema, {
        enabled: true,
        triggerName: "trg_event_enrich",
      }),
      create(TableTriggerSchema, {
        enabled: false,
        triggerName: "trg_shipments_notify",
      }),
    ];

    expect(
      filterTableTriggers(triggers, { search: "  ENRICH  ", states: [] }).map(
        (trigger) => trigger.triggerName
      )
    ).toEqual(["trg_event_enrich"]);
    expect(
      filterTableTriggers(triggers, { search: "", states: ["enabled"] }).map(
        (trigger) => trigger.triggerName
      )
    ).toEqual(["trg_event_enrich"]);
    expect(
      filterTableTriggers(triggers, { search: "", states: ["disabled"] }).map(
        (trigger) => trigger.triggerName
      )
    ).toEqual(["trg_shipments_notify"]);
    expect(
      filterTableTriggers(triggers, {
        search: "",
        states: ["enabled", "disabled"],
      })
    ).toEqual(triggers);
    expect(
      filterTableTriggers(triggers, {
        search: "enrich",
        states: ["disabled"],
      })
    ).toEqual([]);
  });
});
