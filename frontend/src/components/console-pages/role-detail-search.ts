import { z } from "zod";

const roleDetailSearchSchema = z.object({
  grantsReach: z.enum(["owns", "defaults", "public"]).optional(),
  grantsSchema: z.string().optional(),
  grantsType: z
    .enum([
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
    .optional(),
  tab: z
    .enum(["overview", "grants", "members", "definition", "access-map"])
    .optional(),
});

type RoleDetailSearch = z.infer<typeof roleDetailSearchSchema>;
type RoleTab = NonNullable<RoleDetailSearch["tab"]>;
type GrantsType = NonNullable<RoleDetailSearch["grantsType"]>;
type GrantsReach = NonNullable<RoleDetailSearch["grantsReach"]>;

type GrantsView =
  | { kind: "overview" }
  | { kind: "schema"; schema: string; type?: GrantsType | undefined }
  | { kind: "reach"; reach: GrantsReach };

export type { GrantsReach, GrantsType, GrantsView, RoleDetailSearch, RoleTab };
export { roleDetailSearchSchema };
