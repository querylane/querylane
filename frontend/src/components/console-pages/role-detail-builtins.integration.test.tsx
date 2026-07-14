import { create } from "@bufbuild/protobuf";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { BuiltinRoleBody } from "@/components/console-pages/role-detail-builtins";
import { RoleSchema } from "@/protogen/querylane/console/v1alpha1/role_pb";

afterEach(cleanup);

test("shows loading instead of an empty database state while grants resolve", () => {
  render(
    <BuiltinRoleBody
      builtinInfo={null}
      databaseName={undefined}
      databases={[]}
      grantObjects={[]}
      grantsError={null}
      grantsPending={true}
      instanceId="local-dev"
      members={[]}
      onSelectDatabase={vi.fn()}
      parents={[]}
      role={create(RoleSchema, {
        isSystemRole: true,
        name: "instances/local-dev/roles/pg_read_all_data",
        roleName: "pg_read_all_data",
      })}
      selectedDatabaseId={undefined}
    />
  );

  expect(screen.getByText("Loading grants…")).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "No databases" })).toBeNull();
});
