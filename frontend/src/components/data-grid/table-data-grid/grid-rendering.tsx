import { Rows3, SearchX } from "lucide-react";
import {
  type ClipboardEvent,
  createContext,
  type Key,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
} from "react";
import {
  Cell,
  type CellCopyArgs,
  type CellKeyboardEvent,
  type CellKeyDownArgs,
  type CellMouseArgs,
  type CellMouseEvent,
  type CellRendererProps,
  type Column,
  DataGrid,
  type DefaultColumnOptions,
  type Renderers,
  SELECT_COLUMN_KEY,
  type SortColumn,
} from "react-data-grid";
import { isCellSelectionInteractiveTarget } from "@/components/data-grid/table-data-grid/cell-selection-interaction";
import {
  CELL_SELECTION_BOTTOM,
  CELL_SELECTION_LEFT,
  CELL_SELECTION_RIGHT,
  CELL_SELECTION_SELECTED,
  CELL_SELECTION_TOP,
  type CellCoordinate,
  type CellSelectionStore,
  createCellSelectionStore,
  getCellSelectionAppearance,
} from "@/components/data-grid/table-data-grid/cell-selection-state";
import { DataGridCheckbox } from "@/components/data-grid/table-data-grid/data-grid-checkbox";
import {
  EXPAND_COLUMN_KEY,
  type GridRow,
  ROW_KEY_FIELD,
} from "@/components/data-grid/table-data-grid/grid-row-model";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const SKELETON_ROW_COUNT = 8;
const CELL_SELECTION_AUTO_SCROLL_EDGE_SIZE = 32;
const CELL_SELECTION_AUTO_SCROLL_MAX_STEP = 18;
const CELL_SELECTION_CELL_SELECTOR =
  "[data-cell-selection-column-index][data-cell-selection-row-index]";
const SKELETON_ROW_IDS = Array.from(
  { length: SKELETON_ROW_COUNT },
  (_, index) => `skeleton-row-${index}`
);

const DATA_GRID_DEFAULT_COLUMN_OPTIONS = {
  minWidth: 80,
  resizable: true,
  sortable: false,
} satisfies DefaultColumnOptions<GridRow, unknown>;

const EMPTY_CELL_SELECTION_STORE = createCellSelectionStore();
const CellSelectionContext = createContext<CellSelectionStore>(
  EMPTY_CELL_SELECTION_STORE
);

function isDataCell(columnKey: string): boolean {
  return columnKey !== SELECT_COLUMN_KEY && columnKey !== EXPAND_COLUMN_KEY;
}

function hasAppearance(appearance: string, flag: string): true | undefined {
  return appearance.includes(flag) ? true : undefined;
}

function getCellSelectionAutoScrollDelta(
  position: number,
  start: number,
  end: number
): number {
  if (position < start + CELL_SELECTION_AUTO_SCROLL_EDGE_SIZE) {
    return -Math.ceil(
      (Math.min(
        CELL_SELECTION_AUTO_SCROLL_EDGE_SIZE,
        start + CELL_SELECTION_AUTO_SCROLL_EDGE_SIZE - position
      ) /
        CELL_SELECTION_AUTO_SCROLL_EDGE_SIZE) *
        CELL_SELECTION_AUTO_SCROLL_MAX_STEP
    );
  }
  if (position > end - CELL_SELECTION_AUTO_SCROLL_EDGE_SIZE) {
    return Math.ceil(
      (Math.min(
        CELL_SELECTION_AUTO_SCROLL_EDGE_SIZE,
        position - (end - CELL_SELECTION_AUTO_SCROLL_EDGE_SIZE)
      ) /
        CELL_SELECTION_AUTO_SCROLL_EDGE_SIZE) *
        CELL_SELECTION_AUTO_SCROLL_MAX_STEP
    );
  }
  return 0;
}

function getCellCoordinateFromElement(
  cell: HTMLElement
): CellCoordinate | undefined {
  const columnIndex = Number(cell.dataset["cellSelectionColumnIndex"]);
  const rowIndex = Number(cell.dataset["cellSelectionRowIndex"]);
  if (Number.isNaN(columnIndex) || Number.isNaN(rowIndex)) {
    return undefined;
  }
  return { columnIndex, rowIndex };
}

function getCellSelectionAutoScroll(
  grid: HTMLElement,
  pointerPosition: { clientX: number; clientY: number }
) {
  const bounds = grid.getBoundingClientRect();
  return {
    left: getCellSelectionAutoScrollDelta(
      pointerPosition.clientX,
      bounds.left,
      bounds.right
    ),
    top: getCellSelectionAutoScrollDelta(
      pointerPosition.clientY,
      bounds.top,
      bounds.bottom
    ),
  };
}

function cellCoordinatesEqual(
  first: CellCoordinate,
  second: CellCoordinate
): boolean {
  return (
    first.columnIndex === second.columnIndex &&
    first.rowIndex === second.rowIndex
  );
}

function extendCellSelectionToElement({
  cell,
  cellSelectionStore,
  gridRoot,
}: {
  cell: HTMLElement | null | undefined;
  cellSelectionStore: CellSelectionStore;
  gridRoot: HTMLElement;
}) {
  if (!cell) {
    return;
  }
  if (!gridRoot.contains(cell)) {
    return;
  }
  const coordinate = getCellCoordinateFromElement(cell);
  if (!coordinate) {
    return;
  }
  const focus = cellSelectionStore.getState().ranges.at(-1)?.focus;
  if (focus && !cellCoordinatesEqual(focus, coordinate)) {
    window.getSelection()?.removeAllRanges();
  }
  cellSelectionStore.extendTo(coordinate);
}

function hasAutoScrollDelta(delta: { left: number; top: number }): boolean {
  return delta.left !== 0 || delta.top !== 0;
}

function runCellSelectionAutoScroll({
  cellSelectionStore,
  extendSelectionAtPoint,
  grid,
  pointerPosition,
}: {
  cellSelectionStore: CellSelectionStore;
  extendSelectionAtPoint: (clientX: number, clientY: number) => void;
  grid: HTMLElement;
  pointerPosition: { clientX: number; clientY: number };
}): boolean {
  if (!cellSelectionStore.getState().isDragging) {
    return false;
  }
  const delta = getCellSelectionAutoScroll(grid, pointerPosition);
  if (!hasAutoScrollDelta(delta)) {
    return false;
  }
  const previousScroll = {
    left: grid.scrollLeft,
    top: grid.scrollTop,
  };
  grid.scrollBy(delta);
  const didScroll =
    grid.scrollLeft !== previousScroll.left ||
    grid.scrollTop !== previousScroll.top;
  if (!didScroll) {
    return false;
  }
  extendSelectionAtPoint(pointerPosition.clientX, pointerPosition.clientY);
  return true;
}

function CellSelectionCell(props: CellRendererProps<GridRow, unknown>) {
  const cellSelectionStore = useContext(CellSelectionContext);
  const coordinate = {
    columnIndex: props.column.idx,
    rowIndex: props.rowIdx,
  };
  const appearance = useSyncExternalStore(
    cellSelectionStore.subscribe,
    () =>
      isDataCell(props.column.key)
        ? getCellSelectionAppearance(cellSelectionStore.getState(), coordinate)
        : "",
    () => ""
  );
  const isSelected = appearance.includes(CELL_SELECTION_SELECTED);

  function handleMouseEnter(event: ReactMouseEvent<HTMLDivElement>) {
    props.onMouseEnter?.(event);
    const state = cellSelectionStore.getState();
    const activeRange = state.isDragging ? state.ranges.at(-1) : undefined;
    if (!(isDataCell(props.column.key) && state.isDragging && activeRange)) {
      return;
    }
    if (
      activeRange.focus.columnIndex !== coordinate.columnIndex ||
      activeRange.focus.rowIndex !== coordinate.rowIndex
    ) {
      window.getSelection()?.removeAllRanges();
    }
    cellSelectionStore.extendTo(coordinate);
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    props.onPointerDown?.(event);
    if (
      event.pointerType === "mouse" ||
      event.button !== 0 ||
      !isDataCell(props.column.key) ||
      isCellSelectionInteractiveTarget(event.target, event.currentTarget)
    ) {
      return;
    }
    cellSelectionStore.start(coordinate, {
      additive: event.ctrlKey || event.metaKey,
      extend: event.shiftKey,
    });
    if (event.isTrusted) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  }

  return (
    <Cell
      {...props}
      aria-selected={isSelected || props.isCellActive}
      data-cell-range-active={
        isSelected && props.isCellActive ? true : undefined
      }
      data-cell-range-bottom={hasAppearance(appearance, CELL_SELECTION_BOTTOM)}
      data-cell-range-left={hasAppearance(appearance, CELL_SELECTION_LEFT)}
      data-cell-range-right={hasAppearance(appearance, CELL_SELECTION_RIGHT)}
      data-cell-range-selected={isSelected ? true : undefined}
      data-cell-range-top={hasAppearance(appearance, CELL_SELECTION_TOP)}
      data-cell-selection-column-index={
        isDataCell(props.column.key) ? coordinate.columnIndex : undefined
      }
      data-cell-selection-row-index={
        isDataCell(props.column.key) ? coordinate.rowIndex : undefined
      }
      onMouseEnter={handleMouseEnter}
      onPointerDown={handlePointerDown}
    />
  );
}

function renderCell(key: Key, props: CellRendererProps<GridRow, unknown>) {
  return <CellSelectionCell key={key} {...props} />;
}

const DATA_GRID_RENDERERS = {
  renderCell,
  renderCheckbox: DataGridCheckbox,
} satisfies Renderers<GridRow, unknown>;

function gridRowKeyGetter(row: GridRow): string {
  return row[ROW_KEY_FIELD];
}

/**
 * Centered message over the empty grid body. The grid itself stays mounted so
 * the header keeps showing the table's columns and types; this overlay starts
 * below the 36px header row and ignores pointer events, so header interactions
 * (resize, reorder, context menus) keep working.
 */
function NoRowsOverlay({ hasActiveFilter }: { hasActiveFilter: boolean }) {
  const Icon = hasActiveFilter ? SearchX : Rows3;
  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-9 bottom-0 flex items-center justify-center p-6"
      data-slot="grid-no-rows-overlay"
    >
      <Empty className="flex-none border-0 p-0">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Icon aria-hidden={true} className="size-5" />
          </EmptyMedia>
          <EmptyTitle className="text-sm">No rows found</EmptyTitle>
          <EmptyDescription>
            {hasActiveFilter
              ? "Try a different search or filter."
              : "This table is empty."}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-1 rounded-md border p-2">
      {SKELETON_ROW_IDS.map((rowId) => (
        <Skeleton className="h-6 w-full" key={rowId} />
      ))}
    </div>
  );
}

interface GridBodyProps {
  cellSelectionStore: CellSelectionStore;
  columns: Column<GridRow>[];
  /** Full-bleed mode: no side borders/rounding; inset loading/empty panels. */
  flush?: boolean;
  hasActiveFilter: boolean;
  isLoading: boolean;
  onCellContextMenu: (
    args: CellMouseArgs<GridRow>,
    event: CellMouseEvent
  ) => void;
  onCellCopy: (
    args: CellCopyArgs<GridRow>,
    event: ClipboardEvent<HTMLDivElement>
  ) => void;
  onCellKeyDown: (
    args: CellKeyDownArgs<GridRow>,
    event: CellKeyboardEvent
  ) => void;
  onCellMouseDown: (
    args: CellMouseArgs<GridRow>,
    event: CellMouseEvent
  ) => void;
  onColumnsReorder: (sourceColumnKey: string, targetColumnKey: string) => void;
  onSelectedRowsChange: (next: ReadonlySet<string>) => void;
  onSortChange: (next: SortColumn[]) => void;
  rows: GridRow[];
  selectedRows: ReadonlySet<string>;
  sortColumns: SortColumn[];
}

function GridBody({
  columns,
  flush = false,
  hasActiveFilter,
  isLoading,
  onCellContextMenu,
  onCellCopy,
  onCellKeyDown,
  onCellMouseDown,
  onColumnsReorder,
  onSelectedRowsChange,
  onSortChange,
  rows,
  cellSelectionStore,
  selectedRows,
  sortColumns,
}: GridBodyProps) {
  const gridRootRef = useRef<HTMLDivElement>(null);

  useEffect(
    function trackPointerCellSelection() {
      if (isLoading) {
        return;
      }
      const gridRoot = gridRootRef.current;
      if (!gridRoot) {
        return;
      }
      const gridElement = gridRoot.querySelector<HTMLElement>(".rdg");
      if (!gridElement) {
        return;
      }
      const activeGridRoot: HTMLDivElement = gridRoot;
      const activeGrid: HTMLElement = gridElement;
      let activePointerId: number | undefined;
      let animationFrameId: number | undefined;
      let pointerPosition: { clientX: number; clientY: number } | undefined;

      function extendSelectionAtPoint(clientX: number, clientY: number) {
        const cell = document
          .elementFromPoint(clientX, clientY)
          ?.closest<HTMLElement>(CELL_SELECTION_CELL_SELECTOR);
        extendCellSelectionToElement({
          cell,
          cellSelectionStore,
          gridRoot: activeGridRoot,
        });
      }

      function extendSelectionAtPointer(event: PointerEvent) {
        const eventTargetCell =
          event.target instanceof Element
            ? event.target.closest<HTMLElement>(CELL_SELECTION_CELL_SELECTOR)
            : null;
        const capturedTarget =
          eventTargetCell?.hasPointerCapture(event.pointerId) === true;
        const cell =
          !capturedTarget && eventTargetCell
            ? eventTargetCell
            : document
                .elementFromPoint(event.clientX, event.clientY)
                ?.closest<HTMLElement>(CELL_SELECTION_CELL_SELECTOR);
        extendCellSelectionToElement({
          cell,
          cellSelectionStore,
          gridRoot: activeGridRoot,
        });
      }

      function autoScrollCellSelection() {
        animationFrameId = undefined;
        if (!pointerPosition) {
          return;
        }
        const shouldContinue = runCellSelectionAutoScroll({
          cellSelectionStore,
          extendSelectionAtPoint,
          grid: activeGrid,
          pointerPosition,
        });
        if (!shouldContinue) {
          return;
        }
        animationFrameId = requestAnimationFrame(autoScrollCellSelection);
      }

      function scheduleAutoScroll() {
        if (animationFrameId === undefined) {
          animationFrameId = requestAnimationFrame(autoScrollCellSelection);
        }
      }

      function beginPointerSelection(event: PointerEvent) {
        if (event.button !== 0) {
          return;
        }
        activePointerId = event.pointerId;
        pointerPosition = {
          clientX: event.clientX,
          clientY: event.clientY,
        };
      }

      function continuePointerSelection(event: PointerEvent) {
        if (
          event.pointerId !== activePointerId ||
          !cellSelectionStore.getState().isDragging
        ) {
          return;
        }
        pointerPosition = {
          clientX: event.clientX,
          clientY: event.clientY,
        };
        extendSelectionAtPointer(event);
        scheduleAutoScroll();
      }

      function finishSelection() {
        activePointerId = undefined;
        pointerPosition = undefined;
        if (animationFrameId !== undefined) {
          cancelAnimationFrame(animationFrameId);
          animationFrameId = undefined;
        }
        cellSelectionStore.end();
      }

      function finishPointerSelection(event: PointerEvent) {
        if (
          activePointerId !== undefined &&
          event.pointerId !== activePointerId
        ) {
          return;
        }
        finishSelection();
      }

      activeGridRoot.addEventListener(
        "pointerdown",
        beginPointerSelection,
        true
      );
      window.addEventListener("blur", finishSelection);
      window.addEventListener("pointercancel", finishPointerSelection);
      window.addEventListener("pointermove", continuePointerSelection, {
        passive: true,
      });
      window.addEventListener("pointerup", finishPointerSelection);
      return () => {
        finishSelection();
        activeGridRoot.removeEventListener(
          "pointerdown",
          beginPointerSelection,
          true
        );
        window.removeEventListener("blur", finishSelection);
        window.removeEventListener("pointercancel", finishPointerSelection);
        window.removeEventListener("pointermove", continuePointerSelection);
        window.removeEventListener("pointerup", finishPointerSelection);
      };
    },
    [cellSelectionStore, isLoading]
  );

  if (isLoading) {
    return (
      <div className={cn(flush && "p-3")}>
        <LoadingSkeleton />
      </div>
    );
  }
  return (
    <CellSelectionContext value={cellSelectionStore}>
      <div
        className="contents"
        data-keyboard-shortcut-scope="grid"
        ref={gridRootRef}
      >
        <DataGrid
          aria-label="Table data"
          className={cn(
            "rdg-light dark:rdg-dark",
            flush && "rounded-none! border-x-0!"
          )}
          columns={columns}
          defaultColumnOptions={DATA_GRID_DEFAULT_COLUMN_OPTIONS}
          // Keep RDG virtualization on. Wide/complex result sets otherwise mount
          // every visible-page cell and stall the explorer.
          enableVirtualization={true}
          headerRowHeight={36}
          onCellContextMenu={onCellContextMenu}
          onCellCopy={onCellCopy}
          onCellKeyDown={onCellKeyDown}
          onCellMouseDown={onCellMouseDown}
          onColumnsReorder={onColumnsReorder}
          onSelectedRowsChange={onSelectedRowsChange}
          onSortColumnsChange={onSortChange}
          renderers={DATA_GRID_RENDERERS}
          rowHeight={32}
          rowKeyGetter={gridRowKeyGetter}
          rows={rows}
          selectedRows={selectedRows}
          sortColumns={sortColumns}
        />
        {rows.length === 0 ? (
          <NoRowsOverlay hasActiveFilter={hasActiveFilter} />
        ) : null}
      </div>
    </CellSelectionContext>
  );
}

export { GridBody };
