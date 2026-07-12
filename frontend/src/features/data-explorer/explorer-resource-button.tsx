"use client";

import type { ComponentType, SVGProps } from "react";
import { Button } from "@/components/ui/button";
import { highlightMatch } from "@/features/data-explorer/data-explorer-model";
import type {
  CategoryKey,
  ResourceItem,
  Selection,
} from "@/features/data-explorer/data-explorer-types";
import { MaterializedViewIcon } from "@/features/data-explorer/object-icons";
import { cn } from "@/lib/utils";

function resolveResourceIcon(
  item: ResourceItem,
  categoryIcon: ComponentType<SVGProps<SVGSVGElement>>
): ComponentType<SVGProps<SVGSVGElement>> {
  return item.objectType === "materialized"
    ? MaterializedViewIcon
    : categoryIcon;
}

export function ExplorerResourceButton({
  category,
  icon: Icon,
  item,
  onResourceIntent,
  onSelectResource,
  query,
  selection,
}: {
  category: CategoryKey;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  item: ResourceItem;
  onResourceIntent: ((category: CategoryKey, name: string) => void) | undefined;
  onSelectResource: (category: CategoryKey, name: string) => void;
  query: string;
  selection: Selection;
}) {
  const isItemSelected =
    selection.kind === "resource" &&
    selection.category === category &&
    selection.name === item.name;
  const ResolvedIcon = resolveResourceIcon(item, Icon);
  return (
    <Button
      className={cn(
        "h-[26px] w-full justify-start @max-[14rem]/object-browser:gap-1.5 gap-2 px-2 py-0 font-normal text-[13px] hover:bg-accent/60",
        isItemSelected && "bg-accent hover:bg-accent"
      )}
      onClick={() => onSelectResource(category, item.name)}
      onFocus={() => onResourceIntent?.(category, item.name)}
      onMouseEnter={() => onResourceIntent?.(category, item.name)}
      title={item.name}
      variant="ghost"
    >
      <ResolvedIcon className="@max-[14rem]/object-browser:hidden size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-left">
        {highlightMatch(item.name, query)}
      </span>
      {item.badge || item.sizeLabel ? (
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {item.badge ? (
            <span
              className={cn(
                "shrink-0 rounded border px-1.5 py-px font-mono text-[10px] uppercase tracking-wider",
                item.badge.tone === "amber" &&
                  "border-amber-400/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
                item.badge.tone === "blue" &&
                  "border-blue-400/40 bg-blue-500/10 text-blue-700 dark:text-blue-400",
                item.badge.tone === "muted" &&
                  "border-border bg-muted text-muted-foreground",
                item.badge.tone === "violet" &&
                  "border-violet-400/40 bg-violet-500/10 text-violet-600 dark:text-violet-400"
              )}
            >
              {item.badge.label}
            </span>
          ) : null}
          {item.sizeLabel ? (
            <span
              className={cn(
                "@max-[15rem]/object-browser:hidden w-16 text-right font-mono text-[11px] tabular-nums",
                isItemSelected ? "text-foreground/80" : "text-muted-foreground"
              )}
            >
              {item.sizeLabel}
            </span>
          ) : null}
        </span>
      ) : null}
    </Button>
  );
}
