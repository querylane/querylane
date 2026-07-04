import { Copy, Rows3 } from "lucide-react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CellContextMenuProps {
  left: number;
  onClose: () => void;
  onCopyCell: () => void;
  onCopyRow: () => void;
  top: number;
}
function CellContextMenu({
  left,
  onClose,
  onCopyCell,
  onCopyRow,
  top,
}: CellContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(
    function bindOutsideHandlers() {
      function handleMouseDown(event: MouseEvent) {
        const target = event.target as Node | null;
        if (target && menuRef.current?.contains(target)) {
          return;
        }
        onClose();
      }
      function handleKeyDown(event: KeyboardEvent) {
        if (event.key === "Escape") {
          onClose();
        }
      }
      document.addEventListener("mousedown", handleMouseDown);
      document.addEventListener("keydown", handleKeyDown);
      return () => {
        document.removeEventListener("mousedown", handleMouseDown);
        document.removeEventListener("keydown", handleKeyDown);
      };
    },
    [onClose]
  );
  return createPortal(
    <div
      className={cn(
        "fixed z-50 flex min-w-[160px] flex-col overflow-hidden",
        "rounded-md border bg-popover p-1 text-popover-foreground text-sm",
        "shadow-md ring-1 ring-foreground/10"
      )}
      ref={menuRef}
      role="menu"
      style={{
        left,
        top,
      }}
    >
      <Button
        className="h-7 justify-start gap-2 px-2 text-xs"
        onClick={() => {
          onCopyCell();
          onClose();
        }}
        size="sm"
        type="button"
        variant="ghost"
      >
        <Copy className="size-3.5" />
        Copy cell
      </Button>
      <Button
        className="h-7 justify-start gap-2 px-2 text-xs"
        onClick={() => {
          onCopyRow();
          onClose();
        }}
        size="sm"
        type="button"
        variant="ghost"
      >
        <Rows3 className="size-3.5" />
        Copy row
      </Button>
    </div>,
    document.body
  );
}

export { CellContextMenu };
