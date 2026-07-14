import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { GrantsView } from "@/components/console-pages/role-detail-search";
import type { GrantedObject } from "@/components/console-pages/role-grants-shared";
import { GrantsSection } from "@/components/console-pages/role-grants-tab";
import { GrantObjectType } from "@/protogen/querylane/console/v1alpha1/role_pb";

const NO_DEFAULTS_RE = /No ALTER DEFAULT PRIVILEGES rules apply/;
const NO_OWNED_OBJECTS_RE = /doesn't own any objects/;
const NO_PUBLIC_GRANTS_RE = /No grants to PUBLIC are visible/;

afterEach(() => {
  cleanup();
});

function renderPartialFacet(
  grantsView: GrantsView,
  objects: GrantedObject[] = []
) {
  return render(
    <GrantsSection
      builtinInfo={null}
      databaseName="appdb"
      databases={[{ id: "appdb", name: "appdb" }]}
      defaultPrivileges={[]}
      defaultPrivilegesPartial={true}
      error={null}
      facetStates={{
        defaults: "ready",
        owned: "ready",
        publicGrants: "ready",
      }}
      grantsPartial={true}
      grantsView={grantsView}
      isPending={false}
      kind="login"
      objects={objects}
      onNavigateGrants={vi.fn()}
      onSelectDatabase={vi.fn()}
      ownedObjects={[]}
      ownedPartial={true}
      publicGrants={[]}
      publicGrantsPartial={true}
      roleName="app_user"
      selectedDatabaseId="appdb"
    />
  );
}

describe("GrantsSection partial empty states", () => {
  test("keeps an empty direct-grant page inconclusive", () => {
    renderPartialFacet({ kind: "overview" });

    expect(
      screen.getByText("Direct grant results are incomplete")
    ).toBeTruthy();
    expect(screen.queryByText("No direct grants")).toBeNull();
  });

  test("keeps an empty owned-object page inconclusive", () => {
    renderPartialFacet({ kind: "reach", reach: "owns" });

    expect(
      screen.getByText("Owned object results are incomplete")
    ).toBeTruthy();
    expect(screen.queryByText(NO_OWNED_OBJECTS_RE)).toBeNull();
  });

  test("keeps an empty default-privilege page inconclusive", () => {
    renderPartialFacet({ kind: "reach", reach: "defaults" });

    expect(
      screen.getByText("Default privilege results are incomplete")
    ).toBeTruthy();
    expect(screen.queryByText(NO_DEFAULTS_RE)).toBeNull();
  });

  test("keeps an empty PUBLIC-grant page inconclusive", () => {
    renderPartialFacet({ kind: "reach", reach: "public" });

    expect(
      screen.getByText("PUBLIC grant results are incomplete")
    ).toBeTruthy();
    expect(screen.queryByText(NO_PUBLIC_GRANTS_RE)).toBeNull();
  });

  test("does not classify partial direct grants as read only", () => {
    renderPartialFacet({ kind: "overview" }, [
      {
        grantors: ["postgres"],
        key: "orders",
        objectName: "orders",
        objectType: GrantObjectType.TABLE,
        privileges: [{ grantable: false, name: "SELECT" }],
        schemaName: "public",
      },
    ]);

    expect(screen.queryByText("Direct: read only")).toBeNull();
  });

  test("does not reject a schema deep link against partial results", () => {
    renderPartialFacet({ kind: "schema", schema: "later_schema" });

    expect(
      screen.getByText(
        "later_schema is not shown in the available direct grant results."
      )
    ).toBeTruthy();
  });

  test("does not reject a grant type deep link against partial results", () => {
    renderPartialFacet({ kind: "schema", schema: "public", type: "views" }, [
      {
        grantors: ["postgres"],
        key: "orders",
        objectName: "orders",
        objectType: GrantObjectType.TABLE,
        privileges: [{ grantable: false, name: "SELECT" }],
        schemaName: "public",
      },
    ]);

    expect(
      screen.getByText(
        "The requested grant type is not shown in the available direct grant results."
      )
    ).toBeTruthy();
    expect(screen.queryByText("orders")).toBeNull();
  });
});
