import { create } from "@bufbuild/protobuf";
import { useEffect, useRef, useState } from "react";
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
import {
  useReadRowsQuery,
  useReadRowsQueryActions,
} from "@/hooks/api/table-data";
import { INTENT_PREFETCH_POLICY } from "@/lib/query-policy";
import { normalizeAppUiError } from "@/lib/ui-error";
import {
  CellValueMode,
  type ReadRowsRequest,
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
  isPaused,
  isPending,
  name,
  onRetry,
  pkColumnSet,
  row,
}: {
  columns: TableResultColumn[];
  error: unknown;
  isError: boolean;
  isPaused: boolean;
  isPending: boolean;
  name: string;
  onRetry: () => Promise<unknown>;
  pkColumnSet: Set<string>;
  row: { values: TableCell[] } | undefined;
}) {
  if (isPaused) {
    return (
      <div
        aria-label="Waiting for connection"
        className="space-y-1 py-4 text-center"
        role="status"
      >
        <p className="font-medium">{"Waiting for connection"}</p>
        <p className="text-muted-foreground text-sm">
          {"The referenced row will load when the connection returns."}
        </p>
      </div>
    );
  }
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
        <AlertTitle>{"Couldn’t load referenced row"}</AlertTitle>
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
            {"Retry"}
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
          {"Referenced row loaded."}
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
      {"Referenced row not found."}
    </p>
  );
}

function ForeignKeyReferenceContent({
  onNavigate,
  preview,
  request,
  renderOpenReferencedTableLink,
}: {
  onNavigate: () => void;
  preview: ForeignKeyReferencePreview;
  request: ReadRowsRequest;
  renderOpenReferencedTableLink?: RenderOpenReferencedTableLink | undefined;
}) {
  const name = preview.reference.targetTableName;
  const rowsQuery = useReadRowsQuery(request, { enabled: false });
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
              {"Referenced by "}
              {preview.sourceColumn}
              {" ="}{" "}
              <code className="break-all rounded bg-muted px-1 py-0.5 font-mono text-xs">
                {preview.displayValue}
              </code>
              {"."}
            </>
          )}
        </PopoverDescription>
      </PopoverHeader>

      <div className="max-h-[min(28rem,calc(100dvh-10rem))] overflow-y-auto p-4">
        <ForeignKeyReferenceQueryState
          columns={resultSet?.columns ?? []}
          error={rowsQuery.error}
          isError={rowsQuery.isError}
          isPaused={rowsQuery.isPending && rowsQuery.fetchStatus === "paused"}
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
  const [isAwaitingOpen, setIsAwaitingOpen] = useState(false);
  const hoverPrefetchTimerRef = useRef<
    ReturnType<typeof globalThis.setTimeout> | undefined
  >(undefined);
  const openIntentRef = useRef(0);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const formatted = formatTableCell(cell, column);
  const request = create(ReadRowsRequestSchema, {
    cellValueMode: CellValueMode.PREVIEW,
    filter: preview.requiredFilter,
    name: preview.reference.targetTableName,
    pageSize: 1,
    rowCountMode: RowCountMode.NONE,
  });
  const rowsQueryActions = useReadRowsQueryActions(request);

  function clearHoverPrefetchTimer() {
    if (hoverPrefetchTimerRef.current !== undefined) {
      globalThis.clearTimeout(hoverPrefetchTimerRef.current);
      hoverPrefetchTimerRef.current = undefined;
    }
  }

  function cancelOpenIntent() {
    openIntentRef.current += 1;
    setIsAwaitingOpen(false);
  }

  function finishOpenIntent(intent: number) {
    if (openIntentRef.current !== intent) {
      return;
    }
    setIsAwaitingOpen(false);
    setOpen(true);
  }

  function requestOpen() {
    const currentState = rowsQueryActions.getState();
    if (currentState?.status === "success") {
      setIsAwaitingOpen(false);
      setOpen(true);
      return;
    }

    const intent = openIntentRef.current + 1;
    openIntentRef.current = intent;
    setIsAwaitingOpen(true);
    const fetchPromise = rowsQueryActions.fetch();

    if (rowsQueryActions.getState()?.fetchStatus === "paused") {
      finishOpenIntent(intent);
    }
    fetchPromise.then(
      () => finishOpenIntent(intent),
      () => finishOpenIntent(intent)
    );
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      requestOpen();
      return;
    }
    cancelOpenIntent();
    setOpen(false);
  }

  function scheduleReferencedRowPrefetch() {
    clearHoverPrefetchTimer();
    hoverPrefetchTimerRef.current = globalThis.setTimeout(() => {
      hoverPrefetchTimerRef.current = undefined;
      rowsQueryActions.prefetch();
    }, INTENT_PREFETCH_POLICY.delayMs);
  }

  function cancelPendingHoverPrefetch() {
    clearHoverPrefetchTimer();
  }

  function prefetchReferencedRowOnFocus() {
    clearHoverPrefetchTimer();
    rowsQueryActions.prefetch();
  }

  function cancelPendingOpenOnBlur() {
    clearHoverPrefetchTimer();
    if (!open) {
      cancelOpenIntent();
    }
  }

  useEffect(function clearPendingHoverPrefetchOnUnmount() {
    return () => {
      if (hoverPrefetchTimerRef.current !== undefined) {
        globalThis.clearTimeout(hoverPrefetchTimerRef.current);
      }
    };
  }, []);

  useEffect(
    function cancelPendingOpenOnOutsidePointerDown() {
      if (!isAwaitingOpen) {
        return;
      }
      function cancelIfOutsideTrigger(event: PointerEvent) {
        if (
          event.target instanceof Node &&
          triggerRef.current?.contains(event.target)
        ) {
          return;
        }
        openIntentRef.current += 1;
        setIsAwaitingOpen(false);
      }
      document.addEventListener("pointerdown", cancelIfOutsideTrigger);
      return () => {
        document.removeEventListener("pointerdown", cancelIfOutsideTrigger);
      };
    },
    [isAwaitingOpen]
  );

  return (
    <Popover onOpenChange={handleOpenChange} open={open}>
      <PopoverTrigger
        render={
          <ReferenceButton
            aria-busy={isAwaitingOpen || undefined}
            aria-label={`Open ${column.columnName} reference ${formatted.display}`}
            className="h-auto max-w-full justify-start p-0 font-mono text-xs"
            onBlur={cancelPendingOpenOnBlur}
            onClick={(event) => event.stopPropagation()}
            onFocus={prefetchReferencedRowOnFocus}
            onPointerEnter={scheduleReferencedRowPrefetch}
            onPointerLeave={cancelPendingHoverPrefetch}
            ref={triggerRef}
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
            request={request}
          />
        </PopoverContent>
      ) : null}
    </Popover>
  );
}

export { ForeignKeyDataCell };
