import { AlertTriangle, KeyRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { GridStatusItem } from "@/features/data-explorer/table-data/grid-status";

function GridStatusBar({ items }: { items: GridStatusItem[] }) {
  if (items.length === 0) {
    return null;
  }

  return (
    <output
      aria-label="Grid status"
      className="flex min-h-8 flex-wrap items-center gap-1.5 border-t pt-2 text-xs"
    >
      {items.map((item) => (
        <GridStatusBadge item={item} key={item.id} />
      ))}
    </output>
  );
}

function GridStatusBadge({ item }: { item: GridStatusItem }) {
  const icon = getStatusIcon(item);
  const variant = getStatusBadgeVariant(item);
  return (
    <Tooltip>
      <TooltipTrigger render={<span />}>
        <Badge className="gap-1.5" variant={variant}>
          {icon}
          {item.label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>{item.description}</TooltipContent>
    </Tooltip>
  );
}

function getStatusBadgeVariant(item: GridStatusItem) {
  return item.tone === "warning" ? "destructive" : "secondary";
}

function getStatusIcon(item: GridStatusItem) {
  if (item.id === "no-stable-key" || item.id === "row-actions-limited") {
    return <KeyRound className="size-3" />;
  }
  return <AlertTriangle className="size-3" />;
}

export { GridStatusBar };
