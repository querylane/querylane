import { ChevronDown, ChevronUp } from "lucide-react";
import type { ChangeEvent, KeyboardEvent } from "react";
import { RecordField } from "@/components/data-grid/table-data-grid/record-field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatCellForClipboard } from "@/features/data-explorer/table-data/selection-formatters";
import type { QualifiedTableName } from "@/lib/console-resources";
import type {
  TableCell,
  TableResultColumn,
} from "@/protogen/querylane/console/v1alpha1/table_data_pb";

function clampRowNumber(rowNumber: number, rowCount: number) {
  const maxRowNumber = Math.max(rowCount, 1);
  return Math.min(Math.max(rowNumber, 1), maxRowNumber);
}

function keepDigitsOnly(event: ChangeEvent<HTMLInputElement>) {
  const digitsOnly = event.currentTarget.value.replaceAll(/\D/g, "");
  if (event.currentTarget.value !== digitsOnly) {
    event.currentTarget.value = digitsOnly;
  }
}

function RowNumberNavigator({
  hasNext,
  hasPrev,
  onNext,
  onPrev,
  onRowIndexChange,
  rowCount,
  rowIndex,
}: {
  hasNext: boolean;
  hasPrev: boolean;
  onNext: () => void;
  onPrev: () => void;
  onRowIndexChange: (nextRowIndex: number) => void;
  rowCount: number;
  rowIndex: number;
}) {
  const currentRowNumber = String(rowIndex + 1);

  function commitRowNumber(rowNumber: number) {
    const nextRowNumber = clampRowNumber(rowNumber, rowCount);
    const nextRowIndex = nextRowNumber - 1;
    if (nextRowIndex !== rowIndex) {
      onRowIndexChange(nextRowIndex);
    }
    return nextRowNumber;
  }

  function commitDraftRowNumber(input: HTMLInputElement) {
    const parsed = Number.parseInt(input.value, 10);
    if (Number.isNaN(parsed)) {
      input.value = currentRowNumber;
      return;
    }

    const nextRowNumber = commitRowNumber(parsed);
    input.value = String(nextRowNumber);
  }

  function handleRowNumberKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    commitDraftRowNumber(event.currentTarget);
  }

  return (
    <InputGroup
      aria-label="Row navigation"
      className="h-8 w-fit shrink-0"
      data-disabled={rowCount <= 1}
    >
      <InputGroupAddon align="inline-start">
        <InputGroupButton
          aria-label="Previous row"
          disabled={!hasPrev}
          onClick={onPrev}
          size="icon-xs"
          title="Previous row"
        >
          <ChevronUp />
        </InputGroupButton>
      </InputGroupAddon>
      <InputGroupInput
        aria-label="Row number"
        className="h-8 w-10 px-1 text-center font-mono text-xs"
        defaultValue={currentRowNumber}
        disabled={rowCount <= 1}
        inputMode="numeric"
        key={currentRowNumber}
        onBlur={(event) => commitDraftRowNumber(event.currentTarget)}
        onChange={keepDigitsOnly}
        onKeyDown={handleRowNumberKeyDown}
        pattern="[0-9]*"
        type="text"
      />
      <InputGroupAddon align="inline-end" className="gap-1">
        <InputGroupText className="font-mono text-xs">
          of {rowCount.toLocaleString()}
        </InputGroupText>
        <InputGroupButton
          aria-label="Next row"
          disabled={!hasNext}
          onClick={onNext}
          size="icon-xs"
          title="Next row"
        >
          <ChevronDown />
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}

interface RecordDetailDrawerProps {
  columns: TableResultColumn[];
  hasNext: boolean;
  hasPrev: boolean;
  name: string;
  onNext: () => void;
  onOpenChange: (open: boolean) => void;
  onPrev: () => void;
  onRowIndexChange: (nextRowIndex: number) => void;
  open: boolean;
  pkColumnSet: Set<string>;
  rowCells: Map<string, TableCell | undefined>;
  rowCount: number;
  rowIndex: number;
  tableName: QualifiedTableName;
}
function RecordDetailDrawer({
  columns,
  hasNext,
  hasPrev,
  name,
  onNext,
  onOpenChange,
  onPrev,
  onRowIndexChange,
  open,
  rowCount,
  pkColumnSet,
  rowCells,
  rowIndex,
  tableName,
}: RecordDetailDrawerProps) {
  const pkIdentifier = columns
    .filter((column) => pkColumnSet.has(column.columnName))
    .map((column) => formatCellForClipboard(rowCells.get(column.columnName)))
    .filter((value) => value !== "")
    .join("-");
  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        // Registry sheets cap at sm:max-w-sm; record details need a wide
        // drawer, and `ui/` must stay native shadcn output, so the width
        // override lives here.
        className="flex flex-col gap-0 p-0 data-[side=right]:w-[min(calc(100vw-1rem),clamp(34rem,45vw,60rem))] data-[side=right]:sm:max-w-none"
        side="right"
      >
        <SheetHeader className="gap-2 border-b px-5 py-3.5 pr-14">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <SheetTitle className="min-w-0 break-all font-mono text-base leading-snug">
              {tableName.schema}.{tableName.table}
            </SheetTitle>
            <RowNumberNavigator
              hasNext={hasNext}
              hasPrev={hasPrev}
              onNext={onNext}
              onPrev={onPrev}
              onRowIndexChange={onRowIndexChange}
              rowCount={rowCount}
              rowIndex={rowIndex}
            />
          </div>
          <SheetDescription className="sr-only">
            Row {rowIndex + 1} of {rowCount.toLocaleString()}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-auto px-5 py-4">
          <div className="space-y-3.5">
            {columns.map((column) => (
              <RecordField
                cell={rowCells.get(column.columnName)}
                column={column}
                isPrimaryKey={pkColumnSet.has(column.columnName)}
                key={column.columnName}
                rowIdentifier={pkIdentifier === "" ? undefined : pkIdentifier}
                tableName={name}
              />
            ))}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export { RecordDetailDrawer };
