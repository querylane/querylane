import { Eye, type LucideIcon, Table2 } from "lucide-react";

type CategoryKey = "tables" | "views";

interface CategoryMeta {
  icon: LucideIcon;
  label: string;
  singular: string;
}

const CATEGORY_META: Record<CategoryKey, CategoryMeta> = {
  tables: { icon: Table2, label: "Tables", singular: "Table" },
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
  sizeLabel?: string | undefined;
}

export type { CategoryKey, ResourceItem, Selection };
export { CATEGORY_META, CATEGORY_ORDER, isCategoryKey };
