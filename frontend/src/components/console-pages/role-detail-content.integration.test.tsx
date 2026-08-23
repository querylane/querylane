import { create } from "@bufbuild/protobuf";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  rs,
  test,
} from "@rstest/core";
import { cleanup, render, screen } from "@testing-library/react";
import { RoleDetailContent } from "@/components/console-pages/role-detail-content";
import type { RoleDetailViewProps } from "@/components/console-pages/role-detail-model";
import * as roleApiActual from "@/hooks/api/role" with {
  rstest: "importActual",
};
import { RoleSchema } from "@/protogen/querylane/console/v1alpha1/role_pb";

const hookMocks = rs.hoisted(() => ({
  dbContext: rs.fn(),
  defaultPrivileges: rs.fn(),
  grants: rs.fn(),
  owned: rs.fn(),
  publicGrants: rs.fn(),
}));

rs.mock("@tanstack/react-router", () => ({
  useNavigate: () => rs.fn(() => Promise.resolve()),
}));

rs.mock("@/hooks/api/role", () => ({
  ...roleApiActual,
  useListPublicGrantsQuery: hookMocks.publicGrants,
  useListRoleDefaultPrivilegesQuery: hookMocks.defaultPrivileges,
  useListRoleGrantsQuery: hookMocks.grants,
  useListRoleOwnedObjectsQuery: hookMocks.owned,
}));

rs.mock("@/lib/db-context", () => ({
  useDb: hookMocks.dbContext,
}));

rs.mock("@/components/console-pages/role-detail-view", () => ({
  RoleDetailView: (props: RoleDetailViewProps) => (
    <>
      <output data-testid="partial-flags">
        {[
          props.grantsPartial,
          props.ownedPartial,
          props.publicGrantsPartial,
          props.defaultPrivilegesPartial,
          props.partialAccess,
        ].join(",")}
      </output>
      <output data-testid="ready-flags">
        {[props.grantsReady, props.ownedReady].join(",")}
      </output>
    </>
  ),
}));

function settledQuery(data: object) {
  return { data, error: null, isPending: false };
}

beforeEach(() => {
  hookMocks.dbContext.mockReturnValue({
    databases: [{ id: "appdb", name: "appdb" }],
    selectedDatabase: { id: "appdb", name: "appdb" },
  });
});

afterEach(() => {
  cleanup();
  rs.clearAllMocks();
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

  test("keeps grant and ownership counts unavailable without a database", () => {
    hookMocks.dbContext.mockReturnValue({
      databases: [],
      selectedDatabase: null,
    });
    hookMocks.grants.mockReturnValue(settledQuery({ grants: [] }));
    hookMocks.owned.mockReturnValue(settledQuery({ ownedObjects: [] }));
    hookMocks.publicGrants.mockReturnValue(settledQuery({ grants: [] }));
    hookMocks.defaultPrivileges.mockReturnValue(
      settledQuery({ defaultPrivileges: [] })
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

    expect(screen.getByTestId("ready-flags").textContent).toBe("false,false");
  });
});
