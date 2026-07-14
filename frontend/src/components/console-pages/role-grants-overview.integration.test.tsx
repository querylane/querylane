import { create } from "@bufbuild/protobuf";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { GrantsOverview } from "@/components/console-pages/role-grants-overview";
import {
  buildSchemaIndex,
  type GrantedObject,
} from "@/components/console-pages/role-grants-shared";
import {
  DefaultPrivilegeObjectType,
  GrantObjectType,
  OwnedObjectSchema,
} from "@/protogen/querylane/console/v1alpha1/role_pb";

const TEST_NUMBER_5 = 5;

const MAINTAIN_PUBLIC_PREVIEW_RE = /MAINTAIN on 1 table/;
const STALE_SELECT_PUBLIC_PREVIEW_RE = /SELECT on 1 table/;
const DEMO_ECOMMERCE_RE = /demo_ecommerce/i;

afterEach(() => {
  cleanup();
});

it("renders no-direct-grants prose as one description", () => {
  render(
    <GrantsOverview
      databaseName="demo_ecommerce"
      defaultPrivilegesPartial={false}
      defaultRules={[
        {
          creatorRoleName: "owner",
          key: "owner:public:tables",
          objectType: DefaultPrivilegeObjectType.TABLES,
          privileges: [],
          schemaName: "public",
        },
      ]}
      facetStates={{
        defaults: "ready",
        owned: "ready",
        publicGrants: "ready",
      }}
      grantsPartial={false}
      objects={[]}
      onNavigate={vi.fn()}
      ownedObjects={[]}
      ownedPartial={false}
      publicGrantsPartial={false}
      publicObjects={[]}
      schemaIndex={[]}
    />
  );

  const panel = screen
    .getByText("No direct grants")
    .closest("[data-slot='empty-state-panel']");
  const description = panel?.querySelector("[data-slot='empty-description']");

  expect(panel?.querySelector("[data-slot='empty-content']")).toBeNull();
  expect(description?.textContent?.replaceAll(/\s+/g, " ").trim()).toBe(
    "This role has no explicit GRANTs on demo_ecommerce. It may still be reachable via the indirect paths below."
  );
});

it("summarizes MAINTAIN in PUBLIC table grant previews", () => {
  const publicObjects: GrantedObject[] = [
    {
      grantors: ["postgres"],
      key: "public-maintain",
      objectName: "jobs",
      objectType: GrantObjectType.TABLE,
      privileges: [{ grantable: false, name: "MAINTAIN" }],
      schemaName: "public",
    },
  ];

  render(
    <GrantsOverview
      databaseName="demo_ecommerce"
      defaultPrivilegesPartial={false}
      defaultRules={[]}
      facetStates={{
        defaults: "ready",
        owned: "ready",
        publicGrants: "ready",
      }}
      grantsPartial={false}
      objects={[]}
      onNavigate={vi.fn()}
      ownedObjects={[]}
      ownedPartial={false}
      publicGrantsPartial={false}
      publicObjects={publicObjects}
      schemaIndex={[]}
    />
  );

  expect(screen.getByText(MAINTAIN_PUBLIC_PREVIEW_RE)).toBeTruthy();
  expect(screen.queryByText(STALE_SELECT_PUBLIC_PREVIEW_RE)).toBeNull();
});

it("uses the database name when navigating to database-scope grants", async () => {
  const user = userEvent.setup();
  const onNavigate = vi.fn();
  const objects: GrantedObject[] = [
    {
      grantors: ["postgres"],
      key: "large-object",
      objectName: "910277",
      objectType: GrantObjectType.LARGE_OBJECT,
      privileges: [{ grantable: false, name: "SELECT" }],
      schemaName: "",
    },
  ];

  render(
    <GrantsOverview
      databaseName="demo_ecommerce"
      defaultPrivilegesPartial={false}
      defaultRules={[]}
      facetStates={{
        defaults: "ready",
        owned: "ready",
        publicGrants: "ready",
      }}
      grantsPartial={false}
      objects={objects}
      onNavigate={onNavigate}
      ownedObjects={[]}
      ownedPartial={false}
      publicGrantsPartial={false}
      publicObjects={[]}
      schemaIndex={buildSchemaIndex(objects)}
    />
  );

  await user.click(screen.getByRole("button", { name: DEMO_ECOMMERCE_RE }));

  expect(onNavigate).toHaveBeenCalledWith({
    kind: "schema",
    schema: "demo_ecommerce",
  });
});

it("qualifies every truncated facet count as partial", () => {
  const directObjects: GrantedObject[] = [
    {
      grantors: ["postgres"],
      key: "direct-orders",
      objectName: "orders",
      objectType: GrantObjectType.TABLE,
      privileges: [{ grantable: false, name: "SELECT" }],
      schemaName: "public",
    },
  ];

  render(
    <GrantsOverview
      databaseName="demo_ecommerce"
      defaultPrivilegesPartial={true}
      defaultRules={[
        {
          creatorRoleName: "owner",
          key: "owner:public:tables",
          objectType: DefaultPrivilegeObjectType.TABLES,
          privileges: [],
          schemaName: "public",
        },
      ]}
      facetStates={{
        defaults: "ready",
        owned: "ready",
        publicGrants: "ready",
      }}
      grantsPartial={true}
      objects={directObjects}
      onNavigate={vi.fn()}
      ownedObjects={[
        create(OwnedObjectSchema, {
          objectName: "owned_orders",
          objectType: GrantObjectType.TABLE,
          schemaName: "public",
        }),
      ]}
      ownedPartial={true}
      publicGrantsPartial={true}
      publicObjects={directObjects}
      schemaIndex={buildSchemaIndex(directObjects)}
    />
  );

  expect(screen.getAllByText("Partial")).toHaveLength(TEST_NUMBER_5);
});
