import { Copy, FileCode2, Rows3 } from "lucide-react";
import { type KeyboardEvent, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CellContextMenuProps {
  left: number;
  onClose: () => void;
  onCopyCell: () => void;
  onCopyRow: () => void;
  onCopyRowAsSql: () => void;
  returnFocusTo: HTMLElement;
  top: number;
}
const MENU_ITEM_SELECTOR = "[role=menuitem]";

function CellContextMenu({
  left,
  onClose,
  onCopyCell,
  onCopyRow,
  onCopyRowAsSql,
  returnFocusTo,
  top,
}: CellContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  function menuItems() {
    return Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>(
        MENU_ITEM_SELECTOR
      ) ?? []
    );
  }

  function closeAndRestoreFocus() {
    returnFocusTo.focus();
    onClose();
  }

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const items = menuItems();
    const activeElement =
      document.activeElement instanceof HTMLButtonElement
        ? document.activeElement
        : null;
    const currentIndex = activeElement ? items.indexOf(activeElement) : -1;
    let nextIndex: number | undefined;
    switch (event.key) {
      case "ArrowDown":
        nextIndex = (currentIndex + 1) % items.length;
        break;
      case "ArrowUp":
        nextIndex = (currentIndex - 1 + items.length) % items.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = items.length - 1;
        break;
      case "Escape":
        event.preventDefault();
        closeAndRestoreFocus();
        return;
      case "Tab":
        onClose();
        return;
      default:
        return;
    }
    event.preventDefault();
    items[nextIndex]?.focus();
  }

  useEffect(function focusFirstMenuItem() {
    menuRef.current
      ?.querySelector<HTMLButtonElement>(MENU_ITEM_SELECTOR)
      ?.focus();
  }, []);

  useEffect(
    function bindOutsideHandlers() {
      function handleMouseDown(event: MouseEvent) {
        const target = event.target as Node | null;
        if (target && menuRef.current?.contains(target)) {
          return;
        }
        onClose();
      }
      document.addEventListener("mousedown", handleMouseDown);
      return () => {
        document.removeEventListener("mousedown", handleMouseDown);
      };
    },
    [onClose]
  );
  return createPortal(
    <div
      aria-label="Cell actions"
      className={cn(
        "fixed z-50 flex min-w-[160px] flex-col overflow-hidden",
        "rounded-md border bg-popover p-1 text-popover-foreground text-sm",
        "shadow-md ring-1 ring-foreground/10"
      )}
      onKeyDown={handleMenuKeyDown}
      ref={menuRef}
      role="menu"
      style={{
        left,
        top,
      }}
      tabIndex={-1}
    >
      <Button
        className="h-7 justify-start gap-2 px-2 text-xs"
        onClick={() => {
          onCopyCell();
          closeAndRestoreFocus();
        }}
        role="menuitem"
        size="sm"
        tabIndex={-1}
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
          closeAndRestoreFocus();
        }}
        role="menuitem"
        size="sm"
        tabIndex={-1}
        type="button"
        variant="ghost"
      >
        <Rows3 className="size-3.5" />
        Copy row
      </Button>
      <Button
        className="h-7 justify-start gap-2 px-2 text-xs"
        onClick={() => {
          onCopyRowAsSql();
          closeAndRestoreFocus();
        }}
        role="menuitem"
        size="sm"
        tabIndex={-1}
        type="button"
        variant="ghost"
      >
        <FileCode2 className="size-3.5" />
        Copy row as INSERT
      </Button>
    </div>,
    document.body
  );
}

export { CellContextMenu };
