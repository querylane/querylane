import { z } from "zod";
import type { RoleKind } from "@/lib/role-display";

const instanceRolesTabSchema = z.enum(["details", "map"]);
const instanceRolesSearchTabSchema = z.enum([
  "details",
  "map",
  "access-map",
  "definition",
]);
const INSTANCE_ROLES_TYPES = [
  "builtin",
  "group",
  "login",
  "repl",
  "super",
] as const satisfies readonly RoleKind[];
const instanceRolesTypeSchema = z
  .string()
  .optional()
  .transform((value): RoleKind | undefined =>
    isInstanceRolesType(value) ? value : undefined
  );

type InstanceRolesTab = z.infer<typeof instanceRolesTabSchema>;
interface InstanceRolesSearch {
  q?: string | undefined;
  tab?: InstanceRolesTab | undefined;
  type?: RoleKind | undefined;
}

function normalizeInstanceRolesTab(
  value: z.infer<typeof instanceRolesSearchTabSchema> | undefined
): InstanceRolesTab | undefined {
  if (value === "access-map") {
    return "map";
  }

  if (value === "definition") {
    return "details";
  }

  return value;
}

const instanceRolesSearchSchema = z
  .object({
    q: z.string().optional(),
    tab: instanceRolesSearchTabSchema.optional(),
    type: instanceRolesTypeSchema.optional(),
  })
  .transform<InstanceRolesSearch>(({ q, tab, type }) => {
    const search: InstanceRolesSearch = {};
    const normalizedTab = normalizeInstanceRolesTab(tab);

    if (q !== undefined) {
      search.q = q;
    }

    if (normalizedTab !== undefined) {
      search.tab = normalizedTab;
    }

    if (type !== undefined) {
      search.type = type;
    }

    return search;
  });

function isInstanceRolesTab(
  value: string | undefined
): value is InstanceRolesTab {
  return value === "details" || value === "map";
}

function isInstanceRolesType(value: string | undefined): value is RoleKind {
  return INSTANCE_ROLES_TYPES.includes(value as RoleKind);
}

export type { InstanceRolesSearch, InstanceRolesTab };
export { instanceRolesSearchSchema, isInstanceRolesTab, isInstanceRolesType };
