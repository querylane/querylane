import { Copy } from "lucide-react";
import type { ReactNode } from "react";
import { writeClipboard } from "@/components/data-grid/table-data-grid/grid-clipboard";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface DataValueDialogProps {
  children: ReactNode;
  copyLabel: string;
  description: string;
  isTruncated: boolean;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  raw: string;
  title: string;
}

export function DataValueDialog({
  children,
  copyLabel,
  description,
  isTruncated,
  onOpenChange,
  open,
  raw,
  title,
}: DataValueDialogProps) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="!flex !max-w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)] w-[min(72rem,calc(100vw-2rem))] flex-col gap-4 overflow-hidden">
        <DialogHeader className="shrink-0 pr-10">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {isTruncated ? (
          <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-700 text-xs dark:text-amber-300">
            This cell preview is truncated. Open the row detail drawer to load
            the full value.
          </p>
        ) : null}
        {children}
        <div className="flex shrink-0 justify-end">
          <Button
            onClick={() => writeClipboard(raw)}
            size="sm"
            type="button"
            variant="outline"
          >
            <Copy className="size-3.5" />
            {copyLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
