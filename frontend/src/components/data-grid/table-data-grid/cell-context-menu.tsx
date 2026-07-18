import { Copy, FileCode2, Rows3 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

interface CellContextMenuProps {
  left: number;
  onClose: () => void;
  onCopyCell: () => void;
  onCopyRow: () => void;
  onCopyRowAsSql: () => void;
  returnFocusTo: HTMLElement;
  top: number;
}

function CellContextMenu({
  left,
  onClose,
  onCopyCell,
  onCopyRow,
  onCopyRowAsSql,
  returnFocusTo,
  top,
}: CellContextMenuProps) {
  // Point anchor at the right-click position; Base UI's positioner keeps the
  // menu inside the viewport (flip/shift) near window edges.
  const anchor = {
    getBoundingClientRect: () => ({
      bottom: top,
      height: 0,
      left,
      right: left,
      top,
      width: 0,
      x: left,
      y: top,
    }),
  };
  return (
    <DropdownMenu
      modal={false}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      open={true}
    >
      <DropdownMenuContent
        align="start"
        anchor={anchor}
        aria-label="Cell actions"
        className="w-auto min-w-40"
        finalFocus={() => returnFocusTo}
        sideOffset={0}
      >
        <DropdownMenuItem className="gap-2 text-xs" onClick={onCopyCell}>
          <Copy className="size-3.5" />
          Copy cell
        </DropdownMenuItem>
        <DropdownMenuItem className="gap-2 text-xs" onClick={onCopyRow}>
          <Rows3 className="size-3.5" />
          Copy row
        </DropdownMenuItem>
        <DropdownMenuItem className="gap-2 text-xs" onClick={onCopyRowAsSql}>
          <FileCode2 className="size-3.5" />
          Copy row as INSERT
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export { CellContextMenu };
