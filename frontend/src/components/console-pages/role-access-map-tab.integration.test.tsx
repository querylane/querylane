import { create } from "@bufbuild/protobuf";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { RoleAccessMapTab } from "@/components/console-pages/role-access-map-tab";
import type { RoleDetailViewProps } from "@/components/console-pages/role-detail-model";
import type { GrantedObject } from "@/components/console-pages/role-grants-shared";
import {
  DefaultPrivilegeObjectType,
  GrantObjectType,
  ObjectGrantSchema,
  OwnedObjectSchema,
  RoleAttributesSchema,
  RoleDefaultPrivilegeSchema,
  RoleSchema,
} from "@/protogen/querylane/console/v1alpha1/role_pb";

const navigateMock = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
}));

vi.mock("@/features/database-visualization/flow-canvas", () => ({
  ["FlowCanvas"]: ({
    actionPanel,
    nodes,
  }: {
    actionPanel?: React.ReactNode | undefined;
    nodes: { id: string }[];
  }) => (
    <section aria-label="Access flow canvas">
      <fieldset aria-label="Access canvas controls">{actionPanel}</fieldset>
      <span>Node ids {nodes.map((node) => node.id).join(",")}</span>
    </section>
  ),
}));

function grantObject(): GrantedObject {
  return {
    grantors: ["postgres"],
    key: "orders",
    objectName: "orders",
    objectType: GrantObjectType.TABLE,
    privileges: [{ grantable: false, name: "SELECT" }],
    schemaName: "public",
  };
}

function accessMapProps(): RoleDetailViewProps {
  const attributes = create(RoleAttributesSchema, {
    bypassesRls: false,
    canLogin: true,
    canReplicate: false,
    isSuperuser: false,
  });
  return {
    accessRows: [],
    attributes,
    belongsTo: [{ options: [], roleId: "app_group", roleName: "app_group" }],
    builtinInfo: null,
    builtinParentDetails: [],
    commentLine: null,
    connLimitSub: undefined,
    databases: [{ id: "appdb", name: "appdb" }],
    defaultPrivileges: [
      create(RoleDefaultPrivilegeSchema, {
        creatorRole: "instances/local-dev/roles/app_owner",
        creatorRoleName: "app_owner",
        objectType: DefaultPrivilegeObjectType.TABLES,
        privilege: "SELECT",
        schemaName: "public",
        withGrantOption: false,
      }),
    ],
    directGrantsSub: undefined,
    effectiveDb: { id: "appdb", name: "appdb" },
    effectiveDbId: "appdb",
    expiry: { label: "No expiry", state: "none" },
    facetStates: { defaults: "ready", owned: "ready", publicGrants: "ready" },
    grantObjects: [grantObject()],
    grantsError: null,
    grantsPending: false,
    grantsReady: true,
    grantsView: { kind: "overview" },
    instanceId: "local-dev",
    isSystem: false,
    kind: "login",
    memberRows: [{ options: [], roleId: "reporter", roleName: "reporter" }],
    onNavigateGrants: vi.fn(),
    onSelectGrantsDatabase: vi.fn(),
    ownedObjects: [
      create(OwnedObjectSchema, {
        objectName: "job_runs",
        objectType: GrantObjectType.TABLE,
        schemaName: "internal",
      }),
    ],
    ownedReady: true,
    ownedSub: undefined,
    publicGrants: [
      create(ObjectGrantSchema, {
        objectName: "",
        objectType: GrantObjectType.SCHEMA,
        privilege: "USAGE",
        schemaName: "public",
        withGrantOption: false,
      }),
    ],
    rlsNote: null,
    role: create(RoleSchema, {
      attributes,
      name: "instances/local-dev/roles/app_user",
      roleName: "app_user",
    }),
    section: "access-map",
    setChosenDbId: vi.fn(),
    setSection: vi.fn(),
    sql: "CREATE ROLE app_user;",
  };
}

afterEach(() => {
  cleanup();
  navigateMock.mockClear();
});

describe("RoleAccessMapTab", () => {
  test("renders canvas actions inside the access map and filters facets", async () => {
    const user = userEvent.setup();

    render(<RoleAccessMapTab {...accessMapProps()} />);

    const controls = await screen.findByLabelText("Access canvas controls");
    expect(
      within(controls).getByRole("button", { name: "Switch to vertical" })
    ).toBeTruthy();
    expect(
      within(controls).getByRole("button", { name: "Load full map" })
    ).toBeTruthy();
    expect(
      within(controls).getByRole("button", { name: "Resource filters" })
    ).toBeTruthy();
    expect(
      within(controls).getByRole("button", { name: "Expand access map" })
    ).toBeTruthy();

    const canvas = screen.getByLabelText("Access flow canvas");
    expect(canvas.textContent).toContain("role:app_user");
    expect(canvas.textContent).toContain("object:table:public.orders");
    expect(canvas.textContent).toContain("owned:table:internal.job_runs");
    expect(canvas.textContent).toContain("public:schema:public");
    expect(canvas.textContent).toContain(
      "defaults:app_owner:tables:public:SELECT"
    );

    await user.click(
      within(controls).getByRole("button", { name: "Resource filters" })
    );
    await user.click(screen.getByRole("switch", { name: "Direct grants" }));

    await waitFor(() => {
      expect(canvas.textContent).not.toContain("object:table:public.orders");
    });
    expect(canvas.textContent).toContain("role:app_user");
  });

  test("loads the full roles map from inside the canvas", async () => {
    const user = userEvent.setup();

    render(<RoleAccessMapTab {...accessMapProps()} />);

    const controls = await screen.findByLabelText("Access canvas controls");
    await user.click(
      within(controls).getByRole("button", { name: "Load full map" })
    );

    expect(navigateMock).toHaveBeenCalledWith({
      params: { instanceId: "local-dev" },
      search: { tab: "map" },
      to: "/instances/$instanceId/roles",
    });
  });
});
