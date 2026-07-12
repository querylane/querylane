import { Eye, Grid3x3, type LucideIcon } from "lucide-react";

type CategoryKey = "tables" | "views";

/** Concrete object type behind a tree row; refines the category icon. */
type ResourceObjectType = "table" | "partitioned" | "view" | "materialized";

interface CategoryMeta {
  icon: LucideIcon;
  label: string;
  singular: string;
}

const CATEGORY_META: Record<CategoryKey, CategoryMeta> = {
  tables: { icon: Grid3x3, label: "Tables", singular: "Table" },
  views: { icon: Eye, label: "Views", singular: "View" },
};

const CATEGORY_ORDER: readonly CategoryKey[] = ["tables", "views"] as const;

const CATEGORY_KEYS = new Set<string>(CATEGORY_ORDER);

function isCategoryKey(value: string): value is CategoryKey {
  return CATEGORY_KEYS.has(value);
}

interface SchemaSelection {
  kind: "schema";
}
interface ResourceSelection {
  category: CategoryKey;
  kind: "resource";
  name: string;
}
type Selection = SchemaSelection | ResourceSelection;

interface ResourceItem {
  badge?:
    | { label: string; tone: "amber" | "blue" | "muted" | "violet" }
    | undefined;
  name: string;
  objectType?: ResourceObjectType | undefined;
  sizeLabel?: string | undefined;
}

export type { CategoryKey, ResourceItem, ResourceObjectType, Selection };
export { CATEGORY_META, CATEGORY_ORDER, isCategoryKey };
