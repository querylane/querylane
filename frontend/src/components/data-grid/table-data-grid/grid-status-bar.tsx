import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { GridStatusItem } from "@/features/data-explorer/table-data/grid-status";
import { cn } from "@/lib/utils";

function GridStatusBar({
  className,
  items,
}: {
  className?: string | undefined;
  items: GridStatusItem[];
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <output
      aria-label="Grid status"
      className={cn(
        "flex min-h-8 flex-wrap items-center gap-1.5 border-t pt-2 text-xs",
        className
      )}
    >
      {items.map((item) => (
        <GridStatusBadge item={item} key={item.id} />
      ))}
    </output>
  );
}

function GridStatusBadge({ item }: { item: GridStatusItem }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<span />}>
        <Badge className="gap-1.5" variant="destructive">
          <AlertTriangle className="size-3" />
          {item.label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>{item.description}</TooltipContent>
    </Tooltip>
  );
}

export { GridStatusBar };
