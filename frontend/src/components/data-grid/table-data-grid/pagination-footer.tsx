import { ChevronLeft, ChevronRight } from "lucide-react";
import { SelectValue } from "@/components/select-extensions";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";

const PAGE_SIZE_25 = 25;
const PAGE_SIZE_50 = 50;
const PAGE_SIZE_100 = 100;
const PAGE_SIZE_250 = 250;
const PAGE_SIZE_500 = 500;
const PAGE_SIZE_OPTIONS = [
  PAGE_SIZE_25,
  PAGE_SIZE_50,
  PAGE_SIZE_100,
  PAGE_SIZE_250,
  PAGE_SIZE_500,
];
interface PaginationFooterProps {
  hasNext: boolean;
  hasPrev: boolean;
  onNext: () => void;
  onPageSizeChange: (next: number) => void;
  onPrev: () => void;
  pageIndex: number;
  pageLabel: string;
  pageSize: number;
}
export function PaginationFooter({
  hasNext,
  hasPrev,
  onNext,
  onPageSizeChange,
  onPrev,
  pageLabel,
  pageSize,
}: PaginationFooterProps) {
  return (
    <div className="flex h-8 items-center gap-2 text-muted-foreground text-xs">
      <span className="text-[11px]">Rows per page</span>
      <Select
        onValueChange={(value) => {
          if (!value) {
            return;
          }
          onPageSizeChange(Number.parseInt(value, 10));
        }}
        value={String(pageSize)}
      >
        <SelectTrigger aria-label="Rows per page" className="h-7" size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          {PAGE_SIZE_OPTIONS.map((size) => (
            <SelectItem key={size} label={String(size)} value={String(size)}>
              {size}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="ml-auto flex items-center gap-1">
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
