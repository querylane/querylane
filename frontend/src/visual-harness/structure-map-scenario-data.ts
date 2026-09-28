import { create } from "@bufbuild/protobuf";
import { createRouterTransport } from "@connectrpc/connect";
import {
  ListSchemasResponseSchema,
  SchemaSchema,
  SchemaService,
} from "@/protogen/querylane/console/v1alpha1/schema_pb";
import {
  ColumnSchema,
  ConstraintType,
  ListTableColumnsResponseSchema,
  ListTableConstraintsResponseSchema,
  ListTableIndexesResponseSchema,
  ListTablePoliciesResponseSchema,
  ListTablesResponseSchema,
  ListTableTriggersResponseSchema,
  PolicyCommand,
  TableConstraintSchema,
  TableIndexSchema,
  TablePolicySchema,
  TableSchema,
  TableService,
  TableTriggerSchema,
} from "@/protogen/querylane/console/v1alpha1/table_pb";
import {
  ListViewsResponseSchema,
  ViewService,
} from "@/protogen/querylane/console/v1alpha1/view_pb";

// Dense table metadata for the database structure map scenario. Served from
// memory so the rstest behavior test and the Playwright visual harness render
// identical markup without module mocks.

const STRUCTURE_MAP_INSTANCE_ID = "prod";
const STRUCTURE_MAP_DATABASE_ID = "app";
const SCHEMA_NAME = `instances/${STRUCTURE_MAP_INSTANCE_ID}/databases/${STRUCTURE_MAP_DATABASE_ID}/schemas/public`;
const ORDERS_TABLE = `${SCHEMA_NAME}/tables/orders`;
const ACCOUNTS_TABLE = `${SCHEMA_NAME}/tables/accounts`;

const ordersMetadata = {
  columns: [
    { columnName: "order_id", isPrimaryKey: true, rawType: "uuid" },
    { columnName: "account_id", rawType: "uuid" },
    { columnName: "status", isUnique: true, rawType: "text" },
    { columnName: "metadata", isNullable: true, rawType: "jsonb" },
    { columnName: "submitted_at", rawType: "timestamp with time zone" },
    { columnName: "approved_by_role_ids", rawType: "uuid[]" },
  ],
  constraints: [
    {
      columnNames: ["order_id"],
      constraintName: "orders_pkey",
      type: ConstraintType.PRIMARY_KEY,
    },
    {
      columnNames: ["account_id"],
      constraintName: "orders_account_id_fkey",
      referencedColumnNames: ["account_id"],
      referencedTable: ACCOUNTS_TABLE,
      type: ConstraintType.FOREIGN_KEY,
    },
    {
      columnNames: ["status"],
      constraintName: "orders_status_check",
      type: ConstraintType.CHECK,
    },
    {
      columnNames: ["account_id", "submitted_at"],
      constraintName: "orders_account_submitted_unique",
      type: ConstraintType.UNIQUE,
    },
  ],
  indexes: [
    {
      indexName: "orders_account_status_submitted_idx",
      keyColumns: ["account_id", "status", "submitted_at"],
      method: "btree",
    },
    {
      indexName: "orders_metadata_gin_idx",
      keyColumns: ["metadata"],
      method: "gin",
    },
  ],
  policies: [
    {
      command: PolicyCommand.SELECT,
      policyName: "orders_tenant_read_policy",
      roles: ["app_reader", "support_agent"],
    },
    {
      command: PolicyCommand.UPDATE,
      policyName: "orders_status_write_policy",
      roles: ["app_writer"],
    },
  ],
  triggers: [
    {
      enabled: true,
      events: ["INSERT", "UPDATE"],
      functionName: "audit_order_changes",
      timing: "AFTER",
      triggerName: "orders_audit_trigger",
    },
    {
      enabled: false,
      events: ["UPDATE"],
      functionName: "sync_order_search_index",
      timing: "AFTER",
      triggerName: "orders_search_sync_trigger",
    },
  ],
};

const accountsMetadata = {
  columns: [{ columnName: "account_id", isPrimaryKey: true, rawType: "uuid" }],
  constraints: [],
  indexes: [],
  policies: [],
  triggers: [],
};

function metadataFor(parent: string) {
  return parent === ORDERS_TABLE ? ordersMetadata : accountsMetadata;
}

function createStructureMapTransport() {
  return createRouterTransport(({ service }) => {
    service(SchemaService, {
      listSchemas: () =>
        create(ListSchemasResponseSchema, {
          schemas: [
            create(SchemaSchema, {
              displayName: "public",
              name: SCHEMA_NAME,
              owner: "app_owner",
            }),
          ],
        }),
    });
    service(ViewService, {
      listViews: () => create(ListViewsResponseSchema),
    });
    service(TableService, {
      listTableColumns: ({ parent }) =>
        create(ListTableColumnsResponseSchema, {
          columns: metadataFor(parent).columns.map((column) =>
            create(ColumnSchema, column)
          ),
        }),
      listTableConstraints: ({ parent }) =>
        create(ListTableConstraintsResponseSchema, {
          constraints: metadataFor(parent).constraints.map((constraint) =>
            create(TableConstraintSchema, constraint)
          ),
        }),
      listTableIndexes: ({ parent }) =>
        create(ListTableIndexesResponseSchema, {
          indexes: metadataFor(parent).indexes.map((index) =>
            create(TableIndexSchema, index)
          ),
        }),
      listTablePolicies: ({ parent }) =>
        create(ListTablePoliciesResponseSchema, {
          policies: metadataFor(parent).policies.map((policy) =>
            create(TablePolicySchema, policy)
          ),
        }),
      listTables: () =>
        create(ListTablesResponseSchema, {
          tables: [
            create(TableSchema, { displayName: "orders", name: ORDERS_TABLE }),
            create(TableSchema, {
              displayName: "accounts",
              name: ACCOUNTS_TABLE,
            }),
          ],
        }),
      listTableTriggers: ({ parent }) =>
        create(ListTableTriggersResponseSchema, {
          triggers: metadataFor(parent).triggers.map((trigger) =>
            create(TableTriggerSchema, trigger)
          ),
        }),
    });
  });
}

export {
  createStructureMapTransport,
  STRUCTURE_MAP_DATABASE_ID,
  STRUCTURE_MAP_INSTANCE_ID,
};
