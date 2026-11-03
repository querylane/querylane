import { Columns3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import type { ListColumnOption } from "@/lib/list-columns";

function ListColumnSelector({
  columns,
  visibleIds,
  setSelection,
}: {
  columns: readonly ListColumnOption[];
  visibleIds: readonly string[];
  setSelection: (selection: string[] | undefined) => void;
}) {
  const visible = new Set(visibleIds);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
        <Columns3 aria-hidden="true" className="size-3.5" />
        Columns
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        {columns.map((column) => (
          <DropdownMenuCheckboxItem
            key={column.id}
            checked={visible.has(column.id)}
            disabled={
              column.required === true ||
              (visible.size === 1 && visible.has(column.id))
            }
            closeOnClick={false}
            onCheckedChange={(checked) => {
              const next = columns
                .filter((candidate) =>
                  candidate.id === column.id
                    ? checked
                    : visible.has(candidate.id)
                )
                .map((candidate) => candidate.id);
              setSelection(next.length === columns.length ? undefined : next);
            }}
          >
            {column.label}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setSelection(undefined)}>
          Reset columns
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
export { ListColumnSelector };
