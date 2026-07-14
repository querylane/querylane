import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Copy,
  EyeOff,
  Lock,
  Unlock,
} from "lucide-react";
import type { MouseEvent, PointerEvent } from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function stopHeaderClick(event: MouseEvent | PointerEvent) {
  event.stopPropagation();
}

interface ColumnHeaderMenuProps {
  canHide: boolean;
  columnName: string;
  columnRawType: string;
  isFrozen: boolean;
  onCopyName: () => void;
  onHide: () => void;
  onSortAsc: () => void;
  onSortDesc: () => void;
  onToggleFreeze: () => void;
  sortDirection?: "ASC" | "DESC" | undefined;
}
function ColumnHeaderMenu({
  canHide,
  columnName,
  columnRawType,
  isFrozen,
  onCopyName,
  onHide,
  onSortAsc,
  onSortDesc,
  onToggleFreeze,
  sortDirection,
}: ColumnHeaderMenuProps) {
  const [open, setOpen] = useState(false);

  function handleSortAsc() {
    onSortAsc();
    setOpen(false);
  }
  function handleSortDesc() {
    onSortDesc();
    setOpen(false);
  }
  return (
    <DropdownMenu onOpenChange={setOpen} open={open}>
      <DropdownMenuTrigger
        onClick={stopHeaderClick}
        onMouseDown={stopHeaderClick}
        onPointerDown={stopHeaderClick}
        render={
          <Button
            aria-label={`Open options for column ${columnName}`}
            className="shrink-0 text-muted-foreground"
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <ChevronDown />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col gap-0.5">
            <span className="truncate font-mono text-foreground">
              {columnName}
            </span>
            <span className="truncate font-mono text-[11px]">
              {columnRawType || "unknown type"}
            </span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={sortDirection === "ASC"}
          onClick={handleSortAsc}
        >
          <ArrowUp className="size-3.5" />
          Sort ascending
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={sortDirection === "DESC"}
          onClick={handleSortDesc}
        >
          <ArrowDown className="size-3.5" />
          Sort descending
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onCopyName}>
          <Copy className="size-3.5" />
          Copy name
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onToggleFreeze}>
          {isFrozen ? (
            <Unlock className="size-3.5" />
          ) : (
            <Lock className="size-3.5" />
          )}
          {isFrozen ? "Unfreeze column" : "Freeze column"}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!canHide} onClick={onHide}>
          <EyeOff className="size-3.5" />
          Hide column
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export { ColumnHeaderMenu };
