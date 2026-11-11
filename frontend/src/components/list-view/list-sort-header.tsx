import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/querylane-ui/button";
import { type ListSort, listSortDirection } from "@/lib/list-layout";

function ListSortHeader({
  id,
  label,
  sorting,
  setSorting,
  children,
}: {
  id: string;
  label: string;
  children?: ReactNode;
  sorting: readonly ListSort[];
  setSorting: (next: ListSort[]) => void;
}) {
  const current = sorting.find((sort) => sort.id === id);
  const direction = listSortDirection(id, sorting);
  const state = direction ? `sorted ${direction}` : "not sorted";
  let Icon = ChevronsUpDown;
  if (direction === "ascending") {
    Icon = ArrowUp;
  }
  if (direction === "descending") {
    Icon = ArrowDown;
  }
  return (
    <Button
      aria-label={`${label}, ${state}`}
      onClick={() => {
        setSorting(
          current?.desc === true ? [] : [{ id, desc: current !== undefined }]
        );
      }}
      presentation="unpadded"
      size="xs"
      type="button"
      variant="ghost"
    >
      {children ?? label}
      <Icon aria-hidden="true" className="size-3" />
    </Button>
  );
}

export { ListSortHeader };
