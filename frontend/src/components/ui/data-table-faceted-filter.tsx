"use client";

import { Menu } from "@base-ui/react/menu";
import { Check, ListFilter, SearchIcon } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface FacetedFilterOption {
  count?: number | undefined;
  label: string;
  value: string;
}

// Beyond this many selected values the trigger collapses the chips into a
// single "{n} selected" badge so the button stays compact.
const MAX_INLINE_BADGES = 2;
// Show the search box only when the option set is large enough to warrant it.
// Bounded facets of 6 or fewer items scan faster by eye than by typing.
const SEARCH_MIN_OPTIONS = 6;

// Facets are toggle actions, so a filterable menu exposes their checked state
// without pretending that the highlighted option is the selected value.
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
  const [open, setOpen] = useState(false);
  const selected = new Set(selectedValues);
  const availableValues = new Set(options.map((option) => option.value));
  const selectedOptions: FacetedFilterOption[] = [];
  for (const option of options) {
    if (selected.has(option.value)) {
      selectedOptions.push(option);
    }
  }
  for (const value of selected) {
    if (!availableValues.has(value)) {
      selectedOptions.push({ label: "Unavailable", value });
    }
  }

  function toggle(value: string) {
    if (singleSelect) {
      onSelectedValuesChange(selected.has(value) ? [] : [value]);
      return;
    }

    const next = new Set(selected);
    if (next.has(value)) {
      next.delete(value);
    } else {
      next.add(value);
    }
    onSelectedValuesChange(Array.from(next));
  }

  const menu = (
    <DropdownMenu modal={false} onOpenChange={setOpen} open={open}>
      <DropdownMenuTrigger
        render={
          <Button
            className="border-dashed"
            size="sm"
            type="button"
            variant="outline"
          >
            <ListFilter data-icon="inline-start" />
            {title}
            {selected.size > 0 ? (
              <>
                <div
                  aria-hidden="true"
                  className="mx-0.5 h-4 w-px shrink-0 self-center bg-border"
                />
                <Badge
                  className="rounded-sm px-1 font-normal lg:hidden"
                  variant="secondary"
                >
                  {selected.size}
                </Badge>
                <span className="hidden gap-1 lg:flex">
                  {selected.size > MAX_INLINE_BADGES ? (
                    <Badge
                      className="rounded-sm px-1 font-normal"
                      variant="secondary"
                    >
                      {selected.size} selected
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
            ) : null}
          </Button>
        }
      />
      <DropdownMenuContent
        align="start"
        aria-label={`${title} filter`}
        className="w-[220px] p-0"
      >
        {showSearch ? (
          <div className="relative p-1 pb-0">
            <Menu.Input
              aria-label={searchPlaceholder ?? `Search ${title.toLowerCase()}…`}
              className="h-8 pl-8"
              placeholder={
                searchPlaceholder ?? `Search ${title.toLowerCase()}…`
              }
              render={<Input />}
            />
            <SearchIcon
              aria-hidden="true"
              className="pointer-events-none absolute top-3 left-3 size-4 text-muted-foreground"
            />
          </div>
        ) : null}
        {showSearch ? (
          <Menu.Empty className="py-6 text-center text-sm">
            {emptyText}
          </Menu.Empty>
        ) : null}
        <Menu.List
          aria-label={`${title} options`}
          className="max-h-72 scroll-py-1 overflow-y-auto p-1 data-empty:hidden"
        >
          {!showSearch && options.length === 0 && selected.size === 0 ? (
            <DropdownMenuItem
              className="justify-center py-6 text-center"
              disabled
            >
              {emptyText}
            </DropdownMenuItem>
          ) : null}
          <Menu.Group>
            {options.map((option) => {
              const isSelected = selected.has(option.value);
              return (
                <Menu.CheckboxItem
                  checked={isSelected}
                  className="relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden data-highlighted:bg-muted data-highlighted:text-foreground"
                  key={option.value}
                  label={option.label}
                  onCheckedChange={() => toggle(option.value)}
                >
                  <div
                    aria-hidden="true"
                    className={cn(
                      "flex size-4 items-center justify-center rounded-sm border",
                      isSelected
                        ? "border-foreground/70 bg-background text-foreground [&_svg]:text-foreground"
                        : "border-primary opacity-50 [&_svg]:invisible"
                    )}
                    data-slot="faceted-filter-checkbox"
                  >
                    <Check
                      className="size-3.5"
                      data-slot="faceted-filter-checkbox-check"
                    />
                  </div>
                  <span>{option.label}</span>
                  {option.count !== undefined ? (
                    <span className="font-mono text-muted-foreground text-xs tabular-nums">
                      {option.count}
                    </span>
                  ) : null}
                </Menu.CheckboxItem>
              );
            })}
          </Menu.Group>
          {selected.size > 0 ? (
            <>
              <DropdownMenuSeparator />
              <Menu.Group>
                <DropdownMenuItem
                  className="justify-center text-center"
                  onClick={() => onSelectedValuesChange([])}
                >
                  Clear filter
                </DropdownMenuItem>
              </Menu.Group>
            </>
          ) : null}
        </Menu.List>
      </DropdownMenuContent>
    </DropdownMenu>
  );
  return showSearch ? (
    <Menu.FilterProvider autoHighlight>{menu}</Menu.FilterProvider>
  ) : (
    menu
  );
}

export type { FacetedFilterOption };
export { DataTableFacetedFilter };
