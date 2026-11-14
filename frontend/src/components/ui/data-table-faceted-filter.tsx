import {
  Select,
  SelectContent,
  SelectEmpty,
  SelectInput,
  SelectItem,
  SelectList,
  SelectSeparator,
  SelectTrigger,
} from "@ui-sdk/react/select";
import { Check, ListFilter, SearchIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FacetedFilterOption } from "./data-table-faceted-filter-types";

// Beyond this many selected values the trigger collapses the chips into a
// single "{n} selected" badge so the button stays compact.
const MAX_INLINE_BADGES = 2;
// Show the search box only when the option set is large enough to warrant it.
// Bounded facets of 6 or fewer items scan faster by eye than by typing.
const SEARCH_MIN_OPTIONS = 6;

// A multi-select keeps keyboard highlight independent of selected values.
// UI SDK owns accent-insensitive search, selection, and focus restoration.
function selectedFacetOptions(
  options: FacetedFilterOption[],
  selected: Set<string>
) {
  const available = new Set(options.map((option) => option.value));
  const result = options.filter((option) => selected.has(option.value));
  for (const value of selected) {
    if (!available.has(value)) {
      result.push({ label: "Unavailable", value });
    }
  }
  return result;
}

function FacetSelectionSummary({
  count,
  selectedOptions,
}: {
  count: number;
  selectedOptions: FacetedFilterOption[];
}) {
  return count > 0 ? (
    <>
      <div
        aria-hidden="true"
        className="mx-0.5 h-4 w-px shrink-0 self-center bg-border"
      />
      <Badge
        className="rounded-sm px-1 font-normal lg:hidden"
        variant="secondary"
      >
        {count}
      </Badge>
      <span className="hidden gap-1 lg:flex">
        {count > MAX_INLINE_BADGES ? (
          <Badge className="rounded-sm px-1 font-normal" variant="secondary">
            {count} selected
          </Badge>
        ) : (
          selectedOptions.map((option) => (
            <Badge
              className="rounded-sm px-1 font-normal"
              key={option.value}
              variant="secondary"
            >
              {option.label}
            </Badge>
          ))
        )}
      </span>
    </>
  ) : null;
}

function DataTableFacetedFilter({
  emptyText = "No options found.",
  onSelectedValuesChange,
  options,
  searchPlaceholder,
  selectedValues,
  singleSelect = false,
  title,
}: {
  emptyText?: string;
  onSelectedValuesChange: (values: string[]) => void;
  options: FacetedFilterOption[];
  searchPlaceholder?: string;
  selectedValues: string[];
  singleSelect?: boolean | undefined;
  title: string;
}) {
  const showSearch = options.length > SEARCH_MIN_OPTIONS;
  const selected = new Set(selectedValues);
  const selectedOptions = selectedFacetOptions(options, selected);
  return (
    <Select<string, true>
      modal={false}
      multiple={true}
      onValueChange={(values) => {
        const added = values.find((value) => !selected.has(value));
        if (singleSelect) {
          onSelectedValuesChange(added === undefined ? [] : [added]);
        } else {
          onSelectedValuesChange(values);
        }
      }}
      value={selectedValues}
    >
      <SelectTrigger
        aria-label={[
          title,
          selected.size > MAX_INLINE_BADGES
            ? `${selected.size} selected`
            : selectedOptions.map((option) => option.label).join(" "),
        ]
          .filter(Boolean)
          .join(" ")}
        render={
          <Button
            className="border-dashed"
            size="sm"
            type="button"
            variant="outline"
          >
            <ListFilter data-icon="inline-start" />
            {title}
            <FacetSelectionSummary
              count={selected.size}
              selectedOptions={selectedOptions}
            />
          </Button>
        }
      />
      <SelectContent
        align="start"
        aria-label={`${title} options`}
        className="max-h-(--available-height) w-[220px] overflow-y-auto rounded-md bg-popover p-0 text-popover-foreground shadow-md ring-1 ring-foreground/10"
        sideOffset={4}
      >
        {showSearch ? (
          <div className="relative p-1 pb-0">
            <SelectInput
              aria-label={searchPlaceholder ?? `Search ${title.toLowerCase()}…`}
              autoFocus={true}
              className="h-8 w-full rounded-md border border-input bg-transparent pr-2 pl-8 text-sm outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
              placeholder={
                searchPlaceholder ?? `Search ${title.toLowerCase()}…`
              }
            />
            <SearchIcon
              aria-hidden="true"
              className="pointer-events-none absolute top-3 left-3 size-4 text-muted-foreground"
            />
          </div>
        ) : null}
        <SelectEmpty className="py-6 text-center text-sm">
          {emptyText}
        </SelectEmpty>
        <SelectList className="max-h-72 scroll-py-1 overflow-y-auto p-1">
          {options.map((option) => {
            const isSelected = selected.has(option.value);
            return (
              <SelectItem
                className="relative flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-highlighted:bg-muted data-highlighted:text-foreground"
                key={option.value}
                label={option.label}
                value={option.value}
              >
                <div
                  aria-hidden="true"
                  className={cn(
                    "flex size-4 items-center justify-center rounded-sm border",
                    isSelected
                      ? "border-foreground/70 bg-background text-foreground [&_svg]:text-foreground"
                      : "border-primary opacity-50 [&_svg]:invisible"
                  )}
                  data-querylane-slot="faceted-filter-checkbox"
                >
                  <Check
                    className="size-3.5"
                    data-querylane-slot="faceted-filter-checkbox-check"
                  />
                </div>
                <span>{option.label}</span>
                {option.count === undefined ? null : (
                  <span className="font-mono text-xs text-muted-foreground tabular-nums">
                    {option.count}
                  </span>
                )}
              </SelectItem>
            );
          })}
        </SelectList>
        {selected.size > 0 ? (
          <>
            <SelectSeparator />
            <div className="p-1">
              <Button
                className="w-full justify-center text-center"
                onClick={() => {
                  onSelectedValuesChange([]);
                }}
                type="button"
                variant="ghost"
              >
                Clear filter
              </Button>
            </div>
          </>
        ) : null}
      </SelectContent>
    </Select>
  );
}

export { DataTableFacetedFilter };
