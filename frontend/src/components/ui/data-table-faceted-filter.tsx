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
import { BaseUiAgent } from "@/features/ui-agent/base-ui-adapter";
import { cn } from "@/lib/utils";

import type { FacetedFilterOption } from "./data-table-faceted-filter-types";

// Beyond this many selected values the trigger collapses the chips into a
// single "{n} selected" badge so the button stays compact.
const MAX_INLINE_BADGES = 2;
// Show the search box only when the option set is large enough to warrant it.
// Bounded facets of 6 or fewer items scan faster by eye than by typing.
const SEARCH_MIN_OPTIONS = 6;

// Facets are toggle actions, so a filterable menu exposes their checked state
// without pretending that the highlighted option is the selected value.
function nextFacetSelection(
  selected: Set<string>,
  value: string,
  singleSelect: boolean | undefined
) {
  if (singleSelect === true) {
    return selected.has(value) ? [] : [value];
  }
  const next = new Set(selected);
  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }
  return [...next];
}

function FacetOption({
  option,
  isSelected,
  onToggle,
}: {
  option: FacetedFilterOption;
  isSelected: boolean;
  onToggle: (value: string) => void;
}) {
  return (
    <BaseUiAgent kind="checkbox">
      <Menu.CheckboxItem
        checked={isSelected}
        className="relative flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-highlighted:bg-muted data-highlighted:text-foreground"
        label={option.label}
        onCheckedChange={() => {
          onToggle(option.value);
        }}
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
      </Menu.CheckboxItem>
    </BaseUiAgent>
  );
}

function FacetSearchScope({
  enabled,
  children,
}: {
  enabled: boolean;
  children: React.ReactNode;
}) {
  return enabled ? (
    <Menu.FilterProvider autoHighlight={true}>{children}</Menu.FilterProvider>
  ) : (
    children
  );
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
  const [open, setOpen] = useState(false);
  const selected = new Set(selectedValues);
  const availableValues = new Set(options.map((option) => option.value));
  const selectedOptions = [
    ...options.filter((option) => selected.has(option.value)),
    ...selectedValues.flatMap((value) =>
      availableValues.has(value) ? [] : [{ label: "Unavailable", value }]
    ),
  ];

  const toggle = (value: string) => {
    onSelectedValuesChange(nextFacetSelection(selected, value, singleSelect));
  };

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
              disabled={true}
            >
              {emptyText}
            </DropdownMenuItem>
          ) : null}
          <Menu.Group>
            {options.map((option) => (
              <FacetOption
                isSelected={selected.has(option.value)}
                key={option.value}
                onToggle={toggle}
                option={option}
              />
            ))}
          </Menu.Group>
          {selected.size > 0 ? (
            <>
              <DropdownMenuSeparator />
              <Menu.Group>
                <DropdownMenuItem
                  className="justify-center text-center"
                  onClick={() => {
                    onSelectedValuesChange([]);
                  }}
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
  return <FacetSearchScope enabled={showSearch}>{menu}</FacetSearchScope>;
}

export { DataTableFacetedFilter };
