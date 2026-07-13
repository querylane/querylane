import { create } from "@bufbuild/protobuf";
import { useState } from "react";
import { DataCell } from "@/components/data-grid/table-data-grid/data-cell";
import type {
  ForeignKeyReferencePreview,
  RenderOpenReferencedTableLink,
} from "@/components/data-grid/table-data-grid/foreign-key-reference-state";
import { RecordField } from "@/components/data-grid/table-data-grid/record-field";
import { ReferenceButton } from "@/components/querylane-ui/reference-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { formatTableCell } from "@/features/data-explorer/table-data/table-value-format";
import { useReadRowsQuery } from "@/hooks/api/table-data";
import { normalizeAppUiError } from "@/lib/ui-error";
import {
  CellValueMode,
  ReadRowsRequestSchema,
  RowCountMode,
  type TableCell,
  type TableResultColumn,
} from "@/protogen/querylane/console/v1alpha1/table_data_pb";
import { RowIdentity_Source } from "@/protogen/querylane/console/v1alpha1/table_pb";

function ReferencedRowFields({
  columns,
  name,
  pkColumnSet,
  row,
}: {
  columns: TableResultColumn[];
  name: string;
  pkColumnSet: Set<string>;
  row: { values: TableCell[] };
}) {
  return (
    <div className="space-y-3">
      {columns.map((column, index) => (
        <RecordField
          cell={row.values[index]}
          column={column}
          isPrimaryKey={pkColumnSet.has(column.columnName)}
          key={column.columnName}
          tableName={name}
        />
      ))}
    </div>
  );
}

function ForeignKeyReferenceQueryState({
  columns,
  error,
  isError,
  isPending,
  name,
  onRetry,
  pkColumnSet,
  row,
}: {
  columns: TableResultColumn[];
  error: unknown;
  isError: boolean;
  isPending: boolean;
  name: string;
  onRetry: () => Promise<unknown>;
  pkColumnSet: Set<string>;
  row: { values: TableCell[] } | undefined;
}) {
  if (isPending) {
    return (
      <div
        aria-label="Loading referenced row"
        className="space-y-3"
        role="status"
      >
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  }
  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Couldn’t load referenced row</AlertTitle>
        <AlertDescription>
          <p>
            {
              normalizeAppUiError(error, {
                action: "read_rows",
                area: "data-explorer.foreign-key-reference",
                endpoint: "ReadRows",
                source: "query",
                surface: "inline",
              }).message
            }
          </p>
          <Button
            className="mt-3"
            onClick={onRetry}
            size="sm"
            type="button"
            variant="outline"
          >
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }
  if (row) {
    return (
      <>
        <span
          aria-label="Referenced row loaded"
          className="sr-only"
          role="status"
        >
          Referenced row loaded.
        </span>
        <ReferencedRowFields
          columns={columns}
          name={name}
          pkColumnSet={pkColumnSet}
          row={row}
        />
      </>
    );
  }
  return (
    <p className="py-6 text-center text-muted-foreground text-sm" role="status">
      Referenced row not found.
    </p>
  );
}

function ForeignKeyReferenceContent({
  onNavigate,
  preview,
  renderOpenReferencedTableLink,
}: {
  onNavigate: () => void;
  preview: ForeignKeyReferencePreview;
  renderOpenReferencedTableLink?: RenderOpenReferencedTableLink | undefined;
}) {
  const name = preview.reference.targetTableName;
  const rowsQuery = useReadRowsQuery(
    create(ReadRowsRequestSchema, {
      cellValueMode: CellValueMode.PREVIEW,
      filter: preview.requiredFilter,
      name,
      pageSize: 1,
      rowCountMode: RowCountMode.NONE,
    })
  );
  const resultSet = rowsQuery.data?.resultSet;
  const row = resultSet?.rows[0];
  const pkColumnSet = new Set(
    resultSet?.rowIdentity?.source === RowIdentity_Source.PRIMARY_KEY
      ? resultSet.rowIdentity.columnNames
      : []
  );
  function handleRetry() {
    return rowsQuery.refetch();
  }

  return (
    <>
      <PopoverHeader className="min-w-0 break-all border-b p-4">
        <PopoverTitle className="min-w-0 break-all font-mono text-sm">
          {preview.targetLabel}
        </PopoverTitle>
        <PopoverDescription className="min-w-0 break-all">
          {preview.isComposite ? (
            "Referenced by the matching composite key."
          ) : (
            <>
              Referenced by {preview.sourceColumn} ={" "}
              <code className="break-all rounded bg-muted px-1 py-0.5 font-mono text-xs">
                {preview.displayValue}
              </code>
              .
            </>
          )}
        </PopoverDescription>
      </PopoverHeader>

      <div className="max-h-[min(28rem,calc(100dvh-10rem))] overflow-y-auto p-4">
        <ForeignKeyReferenceQueryState
          columns={resultSet?.columns ?? []}
          error={rowsQuery.error}
          isError={rowsQuery.isError}
          isPending={rowsQuery.isPending}
          name={name}
          onRetry={handleRetry}
          pkColumnSet={pkColumnSet}
          row={row}
        />
      </div>

      {renderOpenReferencedTableLink ? (
        <div className="flex justify-end border-t p-3">
          {renderOpenReferencedTableLink(name, onNavigate)}
        </div>
      ) : null}
    </>
  );
}

function ForeignKeyDataCell({
  cell,
  column,
  preview,
  renderOpenReferencedTableLink,
}: {
  cell: TableCell | undefined;
  column: TableResultColumn;
  preview: ForeignKeyReferencePreview;
  renderOpenReferencedTableLink?: RenderOpenReferencedTableLink | undefined;
}) {
  const [open, setOpen] = useState(false);
  const formatted = formatTableCell(cell, column);
  if (formatted.isNull || formatted.display === "") {
    return <DataCell cell={cell} column={column} />;
  }

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        render={
          <ReferenceButton
            aria-label={`Open ${column.columnName} reference ${formatted.display}`}
            className="h-auto max-w-full justify-start p-0 font-mono text-xs"
            onClick={(event) => event.stopPropagation()}
            size="xs"
            title={`Open referenced row for ${column.columnName}`}
            type="button"
          />
        }
      >
        <span className="truncate">{formatted.display}</span>
      </PopoverTrigger>
      {open ? (
        <PopoverContent
          align="start"
          className="max-h-[calc(100dvh-1rem)] w-[min(28rem,calc(100vw-1rem))] gap-0 overflow-hidden p-0"
          sideOffset={6}
        >
          <ForeignKeyReferenceContent
            onNavigate={() => setOpen(false)}
            preview={preview}
            renderOpenReferencedTableLink={renderOpenReferencedTableLink}
          />
        </PopoverContent>
      ) : null}
    </Popover>
  );
}

export { ForeignKeyDataCell };
