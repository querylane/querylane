import { z } from "zod";

const instanceRolesTabSchema = z.enum(["details", "map"]);
const instanceRolesSearchTabSchema = z.enum([
  "details",
  "map",
  "access-map",
  "definition",
]);

type InstanceRolesTab = z.infer<typeof instanceRolesTabSchema>;
interface InstanceRolesSearch {
  q?: string | undefined;
  tab?: InstanceRolesTab | undefined;
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
  })
  .transform<InstanceRolesSearch>(({ q, tab }) => {
    const search: InstanceRolesSearch = {};
    const normalizedTab = normalizeInstanceRolesTab(tab);

    if (q !== undefined) {
      search.q = q;
    }

    if (normalizedTab !== undefined) {
      search.tab = normalizedTab;
    }

    return search;
  });

function isInstanceRolesTab(
  value: string | undefined
): value is InstanceRolesTab {
  return value === "details" || value === "map";
}

export type { InstanceRolesSearch, InstanceRolesTab };
export { instanceRolesSearchSchema, isInstanceRolesTab };
