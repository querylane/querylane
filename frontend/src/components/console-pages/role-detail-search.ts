import "@/lib/zod-locale";
import { z } from "zod/mini";

// Persists the selected role-detail tab in the URL so it survives reloads and
// can be shared. "overview" is the default and is left out of the URL.
//
// The grants* params persist the Grants tab's drill-in selection (overview →
// schema view / Owns / Default privileges / PUBLIC) so those sub-views are
// refresh-safe and shareable too. They are only meaningful while tab="grants"
// and are cleared when navigating to another tab.
const roleDetailSearchSchema = z.object({
  grantsReach: z.optional(z.enum(["owns", "defaults", "public"])),
  grantsSchema: z.optional(z.string()),
  grantsType: z.optional(
    z.enum([
      "tables",
      "views",
      "matviews",
      "sequences",
      "foreign-tables",
      "functions",
      "large-objects",
      "schema",
      "database",
    ])
  ),
  tab: z.optional(
    z.enum(["overview", "grants", "members", "definition", "access-map"])
  ),
});

type RoleDetailSearch = z.infer<typeof roleDetailSearchSchema>;
type RoleTab = NonNullable<RoleDetailSearch["tab"]>;
type GrantsType = NonNullable<RoleDetailSearch["grantsType"]>;
type GrantsReach = NonNullable<RoleDetailSearch["grantsReach"]>;

// The Grants tab's current drill-in, derived from the grants* search params.
type GrantsView =
  | { kind: "overview" }
  | { kind: "schema"; schema: string; type?: GrantsType | undefined }
  | { kind: "reach"; reach: GrantsReach };

export type { GrantsReach, GrantsType, GrantsView, RoleDetailSearch, RoleTab };
export { roleDetailSearchSchema };
