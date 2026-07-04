import { describe, expect, test } from "vitest";
import { buildStructureMapModel } from "@/features/database-visualization/structure-map-model";

describe("buildStructureMapModel", () => {
  test("builds schema, table, column, and foreign key edges", () => {
    const model = buildStructureMapModel({
      databaseName: "postgres",
      schemas: [{ id: "public", name: "public", owner: "app" }],
      tables: [
        {
          columns: [
            {
              columnName: "id",
              isNullable: false,
              isPrimaryKey: true,
              rawType: "uuid",
            },
            {
              columnName: "customer_id",
              isNullable: false,
              isPrimaryKey: false,
              rawType: "uuid",
            },
          ],
          constraints: [
            {
              columnNames: ["customer_id"],
              constraintName: "orders_customer_id_fkey",
              referencedColumnNames: ["id"],
              referencedTable:
                "instances/local/databases/postgres/schemas/public/tables/customers",
              type: "foreign_key",
            },
            {
              columnNames: ["customer_id"],
              constraintName: "orders_customer_check",
              referencedColumnNames: [],
              referencedTable: "",
              type: "check",
            },
          ],
          indexes: [
            {
              indexName: "orders_customer_id_idx",
              isUnique: false,
              keyColumns: ["customer_id"],
              method: "btree",
            },
          ],
          policies: [
            {
              command: "SELECT",
              policyName: "tenant_isolation",
              roles: ["app_user"],
            },
          ],
          schemaName: "public",
          tableName: "orders",
          triggers: [
            {
              enabled: true,
              events: ["INSERT"],
              functionName: "set_updated_at",
              timing: "BEFORE",
              triggerName: "orders_touch",
            },
          ],
        },
        {
          columns: [
            {
              columnName: "id",
              isNullable: false,
              isPrimaryKey: true,
              rawType: "uuid",
            },
          ],
          constraints: [
            {
              columnNames: ["id"],
              constraintName: "customers_pkey",
              referencedColumnNames: [],
              referencedTable: "",
              type: "primary_key",
            },
          ],
          indexes: [],
          policies: [],
          schemaName: "public",
          tableName: "customers",
          triggers: [],
        },
      ],
      views: [],
    });

    expect(model.nodes.map((node) => node.id)).toEqual(
      expect.arrayContaining([
        "database:postgres",
        "schema:public",
        "table:public.orders",
        "table:public.customers",
        "column:public.orders.id",
        "column:public.orders.customer_id",
        "key:public.orders.orders_customer_id_fkey",
        "constraint:public.orders.orders_customer_check",
        "index:public.orders.orders_customer_id_idx",
        "policy:public.orders.tenant_isolation",
        "trigger:public.orders.orders_touch",
        "key:public.customers.customers_pkey",
      ])
    );
    expect(model.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "schema:public->table:public.orders",
          source: "schema:public",
          target: "table:public.orders",
        }),
        expect.objectContaining({
          description: "Column customer_id on orders",
          id: "table:public.orders->column:public.orders.customer_id",
          source: "table:public.orders",
          target: "column:public.orders.customer_id",
        }),
        expect.objectContaining({
          id: "key:public.orders.orders_customer_id_fkey->table:public.customers",
          label: "references customer_id → id",
          source: "key:public.orders.orders_customer_id_fkey",
          target: "table:public.customers",
        }),
        expect.objectContaining({
          description: "CHECK orders_customer_check on orders",
          id: "table:public.orders->constraint:public.orders.orders_customer_check",
          target: "constraint:public.orders.orders_customer_check",
        }),
        expect.objectContaining({
          description: "Policy tenant_isolation on orders",
          id: "table:public.orders->policy:public.orders.tenant_isolation",
          target: "policy:public.orders.tenant_isolation",
        }),
        expect.objectContaining({
          description: "Trigger orders_touch on orders",
          id: "table:public.orders->trigger:public.orders.orders_touch",
          target: "trigger:public.orders.orders_touch",
        }),
      ])
    );
    expect(
      model.edges.find(
        (edge) =>
          edge.id === "table:public.orders->column:public.orders.customer_id"
      )?.label
    ).toBeUndefined();
    expect(
      model.edges.find(
        (edge) =>
          edge.id ===
          "index:public.orders.orders_customer_id_idx->column:public.orders.customer_id"
      )
    ).toBeUndefined();
    expect(
      model.edges.find(
        (edge) =>
          edge.id ===
          "key:public.orders.orders_customer_id_fkey->column:public.orders.customer_id"
      )
    ).toBeUndefined();
    expect(model.summary).toMatchObject({
      foreignKeyCount: 1,
      policyCount: 1,
      tableCount: 2,
      triggerCount: 1,
    });
    expect(
      model.nodes.find((node) => node.id === "table:public.orders")?.data
    ).toMatchObject({
      badges: ["TABLE"],
      lines: [],
      title: "orders",
    });
    expect(
      model.nodes.find((node) => node.id === "column:public.orders.id")?.data
    ).toMatchObject({
      badges: expect.arrayContaining(["COLUMN", "PK"]),
      title: "id",
    });
    expect(
      model.nodes.find(
        (node) => node.id === "key:public.orders.orders_customer_id_fkey"
      )?.data
    ).toMatchObject({
      badges: ["FOREIGN KEY"],
      title: "orders_customer_id_fkey",
    });
  });

  test("builds view nodes for schemas with no base tables", () => {
    const model = buildStructureMapModel({
      databaseName: "postgres",
      schemas: [
        {
          id: "information_schema",
          name: "information_schema",
          owner: "postgres",
        },
      ],
      tables: [],
      views: [
        {
          comment: "SQL tables visible to the current user",
          owner: "postgres",
          schemaName: "information_schema",
          viewName: "tables",
          viewType: "standard",
        },
      ],
    });

    expect(model.nodes.map((node) => node.id)).toEqual(
      expect.arrayContaining([
        "schema:information_schema",
        "view:information_schema.tables",
      ])
    );
    expect(model.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "schema:information_schema->view:information_schema.tables",
          source: "schema:information_schema",
          target: "view:information_schema.tables",
        }),
      ])
    );
    expect(
      model.nodes.find((node) => node.id === "view:information_schema.tables")
        ?.data
    ).toMatchObject({
      badges: ["VIEW"],
      navigation: {
        category: "views",
        name: "tables",
        schema: "information_schema",
        to: "explorer",
      },
      title: "tables",
    });
    expect(model.summary.viewCount).toBe(1);
  });
});
