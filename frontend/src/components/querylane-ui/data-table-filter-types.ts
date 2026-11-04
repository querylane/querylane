interface FacetedFilterOption {
  count?: number | undefined;
  label: string;
  value: string;
}

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
  onSearchCommit?: (() => void) | undefined;
  searchPlaceholder?: string | undefined;
  searchValue: string;
}

export type {
  DataTableFilterFacet,
  DataTableFilterToolbarProps,
  FacetedFilterOption,
};
