"use client";

import type { ComponentType, SVGProps } from "react";
import { Button } from "@/components/querylane-ui/button";
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

function ResourceMetadata({
  isItemSelected,
  item,
}: {
  isItemSelected: boolean;
  item: ResourceItem;
}) {
  if (!(item.badge || item.sizeLabel)) {
    return null;
  }
  return (
    <span className="ml-auto flex shrink-0 items-center gap-1.5">
      {item.badge ? (
        <span
          className={cn(
            "text-(length:--text-micro) shrink-0 rounded border px-1.5 py-px font-mono uppercase tracking-wider",
            item.badge.tone === "amber" &&
              "border-warning-400/40 bg-warning-500/10 text-warning-700 dark:text-warning-400",
            item.badge.tone === "blue" &&
              "border-info-400/40 bg-info-500/10 text-info-700 dark:text-info-400",
            item.badge.tone === "muted" &&
              "border-border bg-muted text-muted-foreground",
            item.badge.tone === "violet" &&
              "border-permission-400/40 bg-permission-500/10 text-permission-600 dark:text-permission-400"
          )}
        >
          {item.badge.label}
        </span>
      ) : null}
      {item.sizeLabel ? (
        <span
          className={cn(
            "text-(length:--text-label-sm) @max-[15rem]/object-browser:hidden w-16 text-right font-mono tabular-nums",
            isItemSelected ? "text-foreground/80" : "text-muted-foreground"
          )}
        >
          {item.sizeLabel}
        </span>
      ) : null}
    </span>
  );
}

export function ExplorerResourceButton({
  category,
  icon: Icon,
  item,
  onSelectResource,
  query,
  selection,
}: {
  category: CategoryKey;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  item: ResourceItem;
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
      className="h-[26px] w-full justify-start"
      data-selected={isItemSelected}
      onClick={() => onSelectResource(category, item.name)}
      presentation="resource-row"
      title={item.name}
      variant="ghost"
    >
      <ResolvedIcon className="@max-[14rem]/object-browser:hidden size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-left">
        {highlightMatch(item.name, query)}
      </span>
      <ResourceMetadata isItemSelected={isItemSelected} item={item} />
    </Button>
  );
}
