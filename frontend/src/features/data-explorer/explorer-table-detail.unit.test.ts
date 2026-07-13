import { create } from "@bufbuild/protobuf";
import { describe, expect, test } from "vitest";
import { deriveColumnRows } from "@/features/data-explorer/explorer-column-rows";
import {
  filterColumnDetailRows,
  filterConstraintsByKind,
  filterIndexesByMethod,
  filterPoliciesByMode,
  filterTriggersByState,
} from "@/features/data-explorer/explorer-table-detail-filters";
import {
  ColumnSchema,
  ConstraintType,
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

const ORDERS_TABLE = "instances/i/databases/d/schemas/public/tables/orders";

describe("deriveColumnRows foreign keys", () => {
  test("maps every column pair of a composite foreign key", () => {
    const rows = deriveColumnRows(
      [column("order_id"), column("line_no"), column("note")],
      [
        foreignKey({
          columnNames: ["order_id", "line_no"],
          referencedColumnNames: ["id", "line_no"],
          referencedTable: ORDERS_TABLE,
        }),
      ],
      []
    );

    expect(rows[0]?.fks).toEqual([{ column: "id", table: "public.orders" }]);
    expect(rows[1]?.fks).toEqual([
      { column: "line_no", table: "public.orders" },
    ]);
    expect(rows[2]?.fks).toEqual([]);
  });

  test("keeps separate foreign key constraints on their own columns", () => {
    const rows = deriveColumnRows(
      [column("customer_id"), column("product_id")],
      [
        foreignKey({
          columnNames: ["customer_id"],
          referencedColumnNames: ["id"],
          referencedTable:
            "instances/i/databases/d/schemas/public/tables/customers",
        }),
        foreignKey({
          columnNames: ["product_id"],
          referencedColumnNames: ["id"],
          referencedTable:
            "instances/i/databases/d/schemas/public/tables/products",
        }),
      ],
      []
    );

    expect(rows[0]?.fks).toEqual([{ column: "id", table: "public.customers" }]);
    expect(rows[1]?.fks).toEqual([{ column: "id", table: "public.products" }]);
  });

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
  test("filters columns by discovered type category and key state", () => {
    const rows = deriveColumnRows(
      [
        create(ColumnSchema, {
          columnName: "id",
          dataType: 1,
          isPrimaryKey: true,
          rawType: "int8",
        }),
        create(ColumnSchema, {
          columnName: "payload",
          dataType: 1,
          rawType: "jsonb",
        }),
      ],
      [],
      []
    );

    expect(
      filterColumnDetailRows(rows, { keyKinds: ["primary"] })
    ).toHaveLength(1);
    expect(filterColumnDetailRows(rows, { typeCategories: ["JSON"] })).toEqual([
      rows[1],
    ]);
  });

  test("filters metadata rows by index method, constraint kind, policy mode, and trigger state", () => {
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
      filterConstraintsByKind(
        [
          create(TableConstraintSchema, {
            constraintName: "orders_check",
            type: ConstraintType.CHECK,
          }),
          create(TableConstraintSchema, {
            constraintName: "orders_pk",
            type: ConstraintType.PRIMARY_KEY,
          }),
        ],
        [ConstraintType.CHECK]
      ).map((constraint) => constraint.constraintName)
    ).toEqual(["orders_check"]);

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

    expect(
      filterTriggersByState(
        [
          create(TableTriggerSchema, { enabled: true, triggerName: "audit" }),
          create(TableTriggerSchema, {
            enabled: false,
            triggerName: "disabled",
          }),
        ],
        ["disabled"]
      ).map((trigger) => trigger.triggerName)
    ).toEqual(["disabled"]);
  });
});
