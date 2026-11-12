import { Columns3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ListColumnOption } from "@/lib/list-columns";

function ListColumnSelector({
  columns,
  visibleIds,
  setSelection,
  resetColumns,
}: {
  columns: readonly ListColumnOption[];
  visibleIds: readonly string[];
  setSelection: (selection: string[] | undefined) => void;
  resetColumns?: () => void;
}) {
  const visible = new Set(visibleIds);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label="Columns"
            size="icon-sm"
            title="Columns"
            variant="outline"
          />
        }
      >
        <Columns3 aria-hidden="true" className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        {columns.map((column) => (
          <DropdownMenuCheckboxItem
            checked={visible.has(column.id)}
            closeOnSelect={false}
            disabled={
              column.required === true ||
              (visible.size === 1 && visible.has(column.id))
            }
            key={column.id}
            onCheckedChange={(checked) => {
              const next = columns.flatMap((candidate) => {
                const included =
                  candidate.id === column.id
                    ? checked
                    : visible.has(candidate.id);
                return included ? [candidate.id] : [];
              });
              setSelection(next.length === columns.length ? undefined : next);
            }}
            value={column.id}
          >
            {column.label}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            if (resetColumns) {
              resetColumns();
            } else {
              setSelection(undefined);
            }
          }}
        >
          Reset columns
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export { ListColumnSelector };
