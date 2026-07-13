import { ChevronLeft, ChevronRight } from "lucide-react";
import { SelectValue } from "@/components/select-extensions";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { PAGE_SIZE_OPTIONS } from "@/lib/pagination";

interface PaginationFooterProps {
  hasNext: boolean;
  hasPrev: boolean;
  onNext: () => void;
  onPageSizeChange: (next: number) => void;
  onPrev: () => void;
  pageLabel: string;
  pageSize: number;
  pageSizeLabel?: string;
  pageSizeOptions?: readonly number[];
}
export function PaginationFooter({
  hasNext,
  hasPrev,
  onNext,
  onPageSizeChange,
  onPrev,
  pageLabel,
  pageSize,
  pageSizeLabel = "Rows per page",
  pageSizeOptions = PAGE_SIZE_OPTIONS,
}: PaginationFooterProps) {
  return (
    <div
      className="flex min-h-8 flex-wrap items-center justify-end gap-x-2 gap-y-1 text-muted-foreground text-xs"
      data-slot="pagination-footer"
    >
      <div className="flex items-center gap-2">
        <span className="text-[11px]">{pageSizeLabel}</span>
        <Select
          onValueChange={(value) => {
            if (!value) {
              return;
            }
            onPageSizeChange(Number.parseInt(value, 10));
          }}
          value={String(pageSize)}
        >
          <SelectTrigger aria-label={pageSizeLabel} className="h-7" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            {pageSizeOptions.map((size) => (
              <SelectItem key={size} label={String(size)} value={String(size)}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-1">
        <Button
          aria-label="Previous page"
          className="size-7 p-0"
          disabled={!hasPrev}
          onClick={onPrev}
          size="sm"
          type="button"
          variant="outline"
        >
          <ChevronLeft className="size-3" />
        </Button>
        <span className="px-1 font-mono tabular-nums">{pageLabel}</span>
        <Button
          aria-label="Next page"
          className="size-7 p-0"
          disabled={!hasNext}
          onClick={onNext}
          size="sm"
          type="button"
          variant="outline"
        >
          <ChevronRight className="size-3" />
        </Button>
      </div>
    </div>
  );
}
