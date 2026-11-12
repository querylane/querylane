import type { FacetedFilterOption } from "@/components/ui/data-table-faceted-filter-types";

interface DataTableFilterFacet {
  label: string;
  onChange: (values: string[]) => void;
  options: FacetedFilterOption[];
  selected: string[];
  singleSelect?: boolean | undefined;
}

interface DataTableFilterToolbarProps {
  className?: string | undefined;
  dataSlot?: string | undefined;
  facets: DataTableFilterFacet[];
  onClearAll: () => void;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string | undefined;
  searchValue: string;
}

export type { DataTableFilterFacet, DataTableFilterToolbarProps };
