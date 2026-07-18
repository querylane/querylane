import { ChevronDown, ChevronUp } from "lucide-react";
import { type ChangeEvent, type KeyboardEvent, useId } from "react";
import { RecordField } from "@/components/data-grid/table-data-grid/record-field";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupInput } from "@/components/ui/input-group";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
  onRowIndexChange,
  rowCount,
  rowIndex,
}: {
  onRowIndexChange: (nextRowIndex: number) => void;
  rowCount: number;
  rowIndex: number;
}) {
  const inputId = useId();
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
    <Field className="w-auto gap-1" orientation="horizontal">
      <FieldLabel
        className="font-mono text-muted-foreground text-xs"
        htmlFor={inputId}
      >
        Row<span className="sr-only"> number</span>
      </FieldLabel>
      <InputGroup className="h-8 w-14" data-disabled={rowCount <= 1}>
        <InputGroupInput
          aria-label="Row number"
          className="h-8 px-1.5 py-0 text-center font-mono text-xs"
          defaultValue={currentRowNumber}
          disabled={rowCount <= 1}
          id={inputId}
          inputMode="numeric"
          key={currentRowNumber}
          onBlur={(event) => commitDraftRowNumber(event.currentTarget)}
          onChange={keepDigitsOnly}
          onKeyDown={handleRowNumberKeyDown}
          pattern="[0-9]*"
          type="text"
        />
      </InputGroup>
      <span className="font-mono text-muted-foreground text-xs">
        of {rowCount.toLocaleString()}
      </span>
    </Field>
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
  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        className="flex flex-col gap-0 p-0"
        side="right"
        size="wide"
      >
        <SheetHeader className="gap-2 border-b px-5 py-4 pr-14">
          <SheetTitle className="break-all font-mono text-base leading-snug">
            {tableName.schema}.{tableName.table}
          </SheetTitle>
          <SheetDescription className="sr-only">
            Row {rowIndex + 1} of {rowCount.toLocaleString()}
          </SheetDescription>
          <fieldset className="flex flex-wrap items-center gap-1.5 text-muted-foreground text-xs">
            <legend className="sr-only">Row navigation</legend>
            <RowNumberNavigator
              onRowIndexChange={onRowIndexChange}
              rowCount={rowCount}
              rowIndex={rowIndex}
            />
            <Button
              aria-label="Previous row"
              disabled={!hasPrev}
              onClick={onPrev}
              size="xs"
              title="Previous row"
              type="button"
              variant="ghost"
            >
              <ChevronUp data-icon="inline-start" />
              Previous
            </Button>
            <Button
              aria-label="Next row"
              disabled={!hasNext}
              onClick={onNext}
              size="xs"
              title="Next row"
              type="button"
              variant="ghost"
            >
              Next
              <ChevronDown data-icon="inline-end" />
            </Button>
          </fieldset>
        </SheetHeader>

        <div className="flex-1 overflow-auto px-5 py-4">
          <div className="space-y-4">
            {columns.map((column) => (
              <RecordField
                cell={rowCells.get(column.columnName)}
                column={column}
                isPrimaryKey={pkColumnSet.has(column.columnName)}
                key={column.columnName}
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
