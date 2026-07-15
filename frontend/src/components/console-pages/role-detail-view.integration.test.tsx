import { create } from "@bufbuild/protobuf";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { RoleDetailViewProps } from "@/components/console-pages/role-detail-model";
import { RoleDetailView } from "@/components/console-pages/role-detail-view";
import type { GrantedObject } from "@/components/console-pages/role-grants-shared";
import {
  GrantObjectType,
  OwnedObjectSchema,
  RoleSchema,
} from "@/protogen/querylane/console/v1alpha1/role_pb";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => (
    <a href="/roles">{children}</a>
  ),
}));

vi.mock("@/components/console-pages/role-detail-builtins", () => ({
  BuiltinRoleBody: () => <div>Built-in role details</div>,
}));

vi.mock("@/components/console-pages/role-detail-tabs", () => ({
  OrdinaryRoleTabs: () => <div>Role tabs</div>,
}));

function roleDetailProps(): RoleDetailViewProps {
  const directGrant: GrantedObject = {
    grantors: ["postgres"],
    key: "orders",
    objectName: "orders",
    objectType: GrantObjectType.TABLE,
    privileges: [{ grantable: false, name: "SELECT" }],
    schemaName: "public",
  };
  return {
    accessRows: [],
    attributes: undefined,
    belongsTo: [],
    builtinInfo: null,
    builtinParentDetails: [],
    comment: "",
    connLimitSub: undefined,
    databases: [{ id: "appdb", name: "appdb" }],
    defaultPrivileges: [],
    defaultPrivilegesPartial: false,
    directGrantsSub: undefined,
    effectiveDb: { id: "appdb", name: "appdb" },
    effectiveDbId: "appdb",
    expiry: { label: "No expiry", state: "none" },
    facetStates: { defaults: "ready", owned: "ready", publicGrants: "ready" },
    grantObjects: [directGrant],
    grantsError: null,
    grantsPartial: false,
    grantsPending: false,
    grantsReady: true,
    grantsView: { kind: "overview" },
    instanceId: "local-dev",
    isSystem: false,
    kind: "login",
    memberRows: [],
    onNavigateGrants: vi.fn(),
    onSelectGrantsDatabase: vi.fn(),
    ownedObjects: [],
    ownedPartial: false,
    ownedReady: true,
    ownedSub: undefined,
    partialAccess: false,
    publicGrants: [],
    publicGrantsPartial: false,
    rlsNote: null,
    role: create(RoleSchema, {
      name: "instances/local-dev/roles/app_user",
      roleName: "app_user",
    }),
    section: "grants",
    setChosenDbId: vi.fn(),
    setSection: vi.fn(),
    sql: "CREATE ROLE app_user;",
  };
}

function kpi(label: string): HTMLElement {
  const cardContent = screen.getByText(label).parentElement;
  if (!cardContent) {
    throw new Error(`Missing ${label} KPI`);
  }
  return cardContent;
}

afterEach(cleanup);

describe("RoleDetailView", () => {
  test("keeps a partial-access warning visible outside the access map tab", () => {
    render(<RoleDetailView {...roleDetailProps()} partialAccess={true} />);

    const warning = screen.getByRole("status");
    expect(
      within(warning).getByText(
        "One or more access categories for appdb exceed the 1,000-result limit. Counts and relationships may be incomplete."
      )
    ).toBeTruthy();
  });

  test("qualifies the owner badge when owned objects are partial", () => {
    render(
      <RoleDetailView
        {...roleDetailProps()}
        ownedObjects={[
          create(OwnedObjectSchema, {
            objectName: "orders",
            objectType: GrantObjectType.TABLE,
          }),
        ]}
        ownedPartial={true}
        partialAccess={true}
      />
    );

    expect(screen.getByText("OWNER · 1 Partial")).toBeTruthy();
  });

  test("qualifies only the access KPIs known to be partial", () => {
    render(<RoleDetailView {...roleDetailProps()} grantsPartial={true} />);

    expect(within(kpi("Direct grants")).getByText("Partial")).toBeTruthy();
    expect(within(kpi("Owns")).queryByText("Partial")).toBeNull();
    expect(within(kpi("Can log in")).queryByText("Partial")).toBeNull();
    expect(within(kpi("Members")).queryByText("Partial")).toBeNull();
  });

  test("warns when built-in role grants are partial", () => {
    render(
      <RoleDetailView
        {...roleDetailProps()}
        grantsPartial={true}
        isSystem={true}
        partialAccess={true}
      />
    );

    expect(screen.getByRole("status").textContent).toContain(
      "Some access data is not shown"
    );
    expect(screen.getByText("Built-in role details")).toBeTruthy();
  });

  test("keeps the partial warning on built-in access-map URLs", () => {
    render(
      <RoleDetailView
        {...roleDetailProps()}
        grantsPartial={true}
        isSystem={true}
        kind="builtin"
        partialAccess={true}
        section="access-map"
      />
    );

    expect(screen.getByRole("status")).toBeTruthy();
  });
});
