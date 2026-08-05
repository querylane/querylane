import { create } from "@bufbuild/protobuf";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import type { GrantsView } from "@/components/console-pages/role-detail-search";
import { GrantsSection } from "@/components/console-pages/role-grants-tab";
import {
  GrantObjectType,
  OwnedObjectSchema,
} from "@/protogen/querylane/console/v1alpha1/role_pb";

const captured = vi.hoisted(() => ({
  direct: [] as unknown[],
  owned: [] as unknown[],
  publicGrants: [] as unknown[],
}));

vi.mock("@/hooks/api/role", () => ({
  publicGrantsForDatabaseQueryInput: (input: unknown) => input,
  roleGrantsForDatabaseQueryInput: (input: unknown) => input,
  roleOwnedObjectsForDatabaseQueryInput: (input: unknown) => input,
  useListPublicGrantsQuery: (
    input: unknown,
    options: { enabled?: boolean } | undefined
  ) => {
    if (options?.enabled) {
      captured.publicGrants.push(input);
    }
    return { data: undefined, error: null, isPending: false };
  },
  useListRoleGrantsQuery: (
    input: unknown,
    options: { enabled?: boolean } | undefined
  ) => {
    if (options?.enabled) {
      captured.direct.push(input);
    }
    return { data: undefined, error: null, isPending: false };
  },
  useListRoleOwnedObjectsQuery: (
    input: unknown,
    options: { enabled?: boolean } | undefined
  ) => {
    if (options?.enabled) {
      captured.owned.push(input);
    }
    return {
      data: {
        nextPageToken: "",
        ownedObjects: [
          {
            objectName: "orders",
            objectType: GrantObjectType.TABLE,
            schemaName: "public",
          },
        ],
      },
      error: null,
      isPending: false,
    };
  },
}));

afterEach(() => {
  cleanup();
  captured.direct.length = 0;
  captured.owned.length = 0;
  captured.publicGrants.length = 0;
});

test("owned object search is sent to the server", async () => {
  const user = userEvent.setup();
  const grantsView: GrantsView = { kind: "reach", reach: "owns" };

  render(
    <GrantsSection
      builtinInfo={null}
      databaseName="appdb"
      databases={[{ id: "appdb", name: "appdb" }]}
      defaultPrivileges={[]}
      defaultPrivilegesPartial={false}
      error={null}
      facetStates={{ defaults: "ready", owned: "ready", publicGrants: "ready" }}
      grantsPartial={false}
      grantsView={grantsView}
      isPending={false}
      kind="login"
      objects={[]}
      onNavigateGrants={vi.fn()}
      onSelectDatabase={vi.fn()}
      ownedObjects={[
        create(OwnedObjectSchema, {
          objectName: "orders",
          objectType: GrantObjectType.TABLE,
          schemaName: "public",
        }),
      ]}
      ownedPartial={false}
      publicGrants={[]}
      publicGrantsPartial={false}
      queryScope={{
        databaseId: "appdb",
        instanceId: "local",
        roleId: "app_user",
      }}
      roleName="app_user"
      selectedDatabaseId="appdb"
    />
  );

  await user.type(
    screen.getByPlaceholderText("Search owned objects…"),
    'ord"ers'
  );

  await waitFor(() => {
    expect(captured.owned.at(-1)).toMatchObject({
      filter: '(object_name:"ord\\"ers" OR schema_name:"ord\\"ers")',
    });
  });
  expect(captured.direct).toHaveLength(0);
  expect(captured.publicGrants).toHaveLength(0);
});

test("schema kind and search filters are sent together", async () => {
  const user = userEvent.setup();

  render(
    <GrantsSection
      builtinInfo={null}
      databaseName="appdb"
      databases={[{ id: "appdb", name: "appdb" }]}
      defaultPrivileges={[]}
      defaultPrivilegesPartial={false}
      error={null}
      facetStates={{ defaults: "ready", owned: "ready", publicGrants: "ready" }}
      grantsPartial={false}
      grantsView={{ kind: "schema", schema: "public", type: "tables" }}
      isPending={false}
      kind="login"
      objects={[
        {
          grantors: ["postgres"],
          key: "orders",
          objectName: "orders",
          objectType: GrantObjectType.TABLE,
          privileges: [{ grantable: false, name: "SELECT" }],
          schemaName: "public",
        },
      ]}
      onNavigateGrants={vi.fn()}
      onSelectDatabase={vi.fn()}
      ownedObjects={[]}
      ownedPartial={false}
      publicGrants={[]}
      publicGrantsPartial={false}
      queryScope={{
        databaseId: "appdb",
        instanceId: "local",
        roleId: "app_user",
      }}
      roleName="app_user"
      selectedDatabaseId="appdb"
    />
  );

  await user.type(screen.getByPlaceholderText("Search objects…"), "orders");

  await waitFor(() => {
    expect(captured.direct.at(-1)).toMatchObject({
      filter:
        'schema_name = "public" AND object_type = "TABLE" AND (object_name:"orders" OR schema_name:"orders")',
    });
  });
  expect(captured.owned).toHaveLength(0);
  expect(captured.publicGrants).toHaveLength(0);
});
