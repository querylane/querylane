import type { RoleKind } from "@/lib/role-display";
import "@/lib/zod-locale";
import { z } from "zod/mini";

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
const instanceRolesTypeValueSchema = z.enum(INSTANCE_ROLES_TYPES);
const instanceRolesTypeSchema = z.pipe(
  z.optional(z.string()),
  z.transform((value): RoleKind | undefined =>
    isInstanceRolesType(value) ? value : undefined
  )
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

const instanceRolesSearchSchema = z.pipe(
  z.object({
    q: z.optional(z.string()),
    tab: z.optional(instanceRolesSearchTabSchema),
    type: z.optional(instanceRolesTypeSchema),
  }),
  z.transform(({ q, tab, type }): InstanceRolesSearch => {
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
  })
);

function isInstanceRolesTab(
  value: string | undefined
): value is InstanceRolesTab {
  return value === "details" || value === "map";
}

function isInstanceRolesType(value: string | undefined): value is RoleKind {
  return instanceRolesTypeValueSchema.safeParse(value).success;
}

export type { InstanceRolesSearch, InstanceRolesTab };
export { instanceRolesSearchSchema, isInstanceRolesTab, isInstanceRolesType };
