import { create } from "@bufbuild/protobuf";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { RoleDetailContent } from "@/components/console-pages/role-detail-content";
import type { RoleDetailViewProps } from "@/components/console-pages/role-detail-model";
import { RoleSchema } from "@/protogen/querylane/console/v1alpha1/role_pb";

const hookMocks = vi.hoisted(() => ({
  defaultPrivileges: vi.fn(),
  grants: vi.fn(),
  owned: vi.fn(),
  publicGrants: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(() => Promise.resolve()),
}));

vi.mock("@/hooks/api/role", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/hooks/api/role")>();
  return {
    ...original,
    useListPublicGrantsQuery: hookMocks.publicGrants,
    useListRoleDefaultPrivilegesQuery: hookMocks.defaultPrivileges,
    useListRoleGrantsQuery: hookMocks.grants,
    useListRoleOwnedObjectsQuery: hookMocks.owned,
  };
});

vi.mock("@/lib/db-context", () => ({
  useDb: () => ({
    databases: [{ id: "appdb", name: "appdb" }],
    selectedDatabase: { id: "appdb", name: "appdb" },
  }),
}));

vi.mock("@/components/console-pages/role-detail-view", () => ({
  RoleDetailView: (props: RoleDetailViewProps) => (
    <output data-testid="partial-flags">
      {[
        props.grantsPartial,
        props.ownedPartial,
        props.publicGrantsPartial,
        props.defaultPrivilegesPartial,
        props.partialAccess,
      ].join(",")}
    </output>
  ),
}));

function settledQuery(data: object) {
  return { data, error: null, isPending: false };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("RoleDetailContent", () => {
  test("derives partial-access flags from enabled response page tokens", () => {
    hookMocks.grants.mockReturnValue(
      settledQuery({ grants: [], nextPageToken: "more-grants" })
    );
    hookMocks.owned.mockReturnValue(
      settledQuery({ nextPageToken: "", ownedObjects: [] })
    );
    hookMocks.publicGrants.mockReturnValue(
      settledQuery({ grants: [], nextPageToken: "" })
    );
    hookMocks.defaultPrivileges.mockReturnValue(
      settledQuery({ defaultPrivileges: [], nextPageToken: "more-defaults" })
    );

    render(
      <RoleDetailContent
        grantsReach={undefined}
        grantsSchema={undefined}
        grantsType={undefined}
        instanceId="local-dev"
        members={[]}
        role={create(RoleSchema, {
          name: "instances/local-dev/roles/app_user",
          roleName: "app_user",
        })}
        roleId="app_user"
        tab="grants"
      />
    );

    expect(screen.getByTestId("partial-flags").textContent).toBe(
      "true,false,false,true,true"
    );
  });

  test("keeps cached partial access qualified while showing cached counts", () => {
    hookMocks.grants.mockReturnValue(
      settledQuery({ grants: [], nextPageToken: "cached-grants" })
    );
    hookMocks.owned.mockReturnValue(
      settledQuery({ nextPageToken: "cached-owned", ownedObjects: [] })
    );
    hookMocks.publicGrants.mockReturnValue(
      settledQuery({ grants: [], nextPageToken: "cached-public" })
    );
    hookMocks.defaultPrivileges.mockReturnValue(
      settledQuery({
        defaultPrivileges: [],
        nextPageToken: "cached-defaults",
      })
    );

    render(
      <RoleDetailContent
        grantsReach={undefined}
        grantsSchema={undefined}
        grantsType={undefined}
        instanceId="local-dev"
        members={[]}
        role={create(RoleSchema, {
          name: "instances/local-dev/roles/app_user",
          roleName: "app_user",
        })}
        roleId="app_user"
        tab="overview"
      />
    );

    expect(screen.getByTestId("partial-flags").textContent).toBe(
      "true,true,true,true,true"
    );
  });
});
