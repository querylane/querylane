"use client";

import { Search, X } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  DataTableFacetedFilter,
  type FacetedFilterOption,
} from "@/components/ui/data-table-faceted-filter";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

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

function hasMultipleMeaningfulOptions(facet: DataTableFilterFacet) {
  return new Set(facet.options.map((option) => option.value)).size >= 2;
}

function DataTableFilterToolbar({
  className,
  dataSlot = "data-table-filter-toolbar",
  facets,
  onClearAll,
  onSearchChange,
  searchPlaceholder = "Filter...",
  searchValue,
}: DataTableFilterToolbarProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const visibleFacets = facets.filter(
    (facet) =>
      facet.selected.length > 0 || hasMultipleMeaningfulOptions(facet)
  );
  const hasActiveFilters =
    Boolean(searchValue) || facets.some((facet) => facet.selected.length > 0);

  function handleClearAll() {
    onClearAll();
    searchInputRef.current?.focus();
  }

  function handleFacetChange(facet: DataTableFilterFacet, values: string[]) {
    if (values.length === 0 && !hasMultipleMeaningfulOptions(facet)) {
      searchInputRef.current?.focus();
    }
    facet.onChange(values);
  }

  return (
    <div
      className={cn(
        "flex min-w-0 flex-wrap items-center justify-start gap-2",
        className
      )}
      data-slot={dataSlot}
    >
      <div className="relative w-52 max-w-full shrink-0">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          aria-label={searchPlaceholder}
          className="h-8 pl-8 text-sm"
          name="table-filter"
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={searchPlaceholder}
          ref={searchInputRef}
          value={searchValue}
        />
      </div>
      {visibleFacets.map((facet) => (
        <DataTableFacetedFilter
          key={facet.label}
          onSelectedValuesChange={(values) => handleFacetChange(facet, values)}
          options={facet.options}
          selectedValues={facet.selected}
          singleSelect={facet.singleSelect}
          title={facet.label}
        />
      ))}
      {hasActiveFilters ? (
        <Button
          className="h-8 px-2 text-xs"
          onClick={handleClearAll}
          size="sm"
          type="button"
          variant="ghost"
        >
          <X data-icon="inline-start" />
          Clear all
        </Button>
      ) : null}
    </div>
  );
}

export type { DataTableFilterFacet, DataTableFilterToolbarProps };
export { DataTableFilterToolbar };
