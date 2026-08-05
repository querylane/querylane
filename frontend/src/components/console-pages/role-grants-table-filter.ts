import type { GrantedObject } from "@/components/console-pages/role-grants-shared";
import type { OwnedObject } from "@/protogen/querylane/console/v1alpha1/role_pb";

type RoleGrantsTableSource = "direct" | "owned" | "public";

interface RoleGrantsTableFilter {
  filter: string;
  source: RoleGrantsTableSource;
}

interface RoleGrantsTableSlice {
  error: unknown;
  filter: string;
  grantObjects: GrantedObject[];
  isPending: boolean;
  ownedObjects: OwnedObject[];
  partial: boolean;
  source: RoleGrantsTableSource;
}

type SetRoleGrantsTableFilter = (filter: RoleGrantsTableFilter | null) => void;

interface RoleGrantsQueryScope {
  databaseId: string;
  instanceId: string;
  roleId: string;
}

function selectRoleGrantsTableSlice(
  tableSlice: RoleGrantsTableSlice | undefined,
  source: RoleGrantsTableSource,
  filter: string | undefined
): RoleGrantsTableSlice | undefined {
  return tableSlice?.source === source && tableSlice.filter === filter
    ? tableSlice
    : undefined;
}

export type {
  RoleGrantsQueryScope,
  RoleGrantsTableFilter,
  RoleGrantsTableSlice,
  RoleGrantsTableSource,
  SetRoleGrantsTableFilter,
};
export { selectRoleGrantsTableSlice };
