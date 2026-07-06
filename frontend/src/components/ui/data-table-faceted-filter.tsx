"use client";

import { Check, ListFilter } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface FacetedFilterOption {
  count?: number | undefined;
  label: string;
  value: string;
}

// Beyond this many selected values the trigger collapses the chips into a
// single "{n} selected" badge so the button stays compact.
const MAX_INLINE_BADGES = 2;
const CLEAR_ITEM_VALUE = "__clear-faceted-filter__";

// Shadcn data-table faceted filter: a dashed-border trigger with a filter icon
// and the facet title, opening a searchable command list of controlled options.
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
  singleSelect?: boolean;
  title: string;
}) {
  const selected = new Set(selectedValues);

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

  return (
    <Popover>
      <PopoverTrigger
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
                    options
                      .filter((option) => selected.has(option.value))
                      .map((option) => (
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
      <PopoverContent align="start" className="w-[220px] p-0">
        <Command>
          <CommandInput placeholder={searchPlaceholder ?? title} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = selected.has(option.value);
                return (
                  <CommandItem
                    key={option.value}
                    onSelect={() => toggle(option.value)}
                    value={option.label}
                  >
                    <div
                      className={cn(
                        "flex size-4 items-center justify-center border",
                        singleSelect ? "rounded-full" : "rounded-sm",
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
                      <span className="ml-auto font-mono text-muted-foreground text-xs tabular-nums">
                        {option.count}
                      </span>
                    ) : null}
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {selected.size > 0 ? (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    className="justify-center text-center"
                    onSelect={() => onSelectedValuesChange([])}
                    value={CLEAR_ITEM_VALUE}
                  >
                    Clear filter
                  </CommandItem>
                </CommandGroup>
              </>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export type { FacetedFilterOption };
export { DataTableFacetedFilter };
