import type { ClipboardEvent } from "react";
import type { CellCopyArgs, Column } from "react-data-grid";
import { toast } from "sonner";
import {
  type CellSelectionBlocks,
  collectCellSelectionBlocks,
  collectSelectedRows,
  copyCellValue,
  copyRowValues,
  countCellsNeedingFullValue,
  countCellsNeedingFullValueInBlocks,
  formatCellSelectionBlocks,
  getDisplayedDataColumnKeys,
  hasActiveTextSelectionInsideGrid,
  MAX_SELECTION_FULL_VALUE_FETCHES,
  reportTruncatedExport,
} from "@/components/data-grid/table-data-grid/cell-selection-copy";
import type { CellSelectionStore } from "@/components/data-grid/table-data-grid/cell-selection-state";
import { getGridCell } from "@/components/data-grid/table-data-grid/grid-cell-access";
import {
  writeClipboard,
  writeClipboardDeferred,
} from "@/components/data-grid/table-data-grid/grid-clipboard";
import type { GridRow } from "@/components/data-grid/table-data-grid/grid-row-model";
import {
  cellNeedsFullValue,
  type FetchFullCell,
  resolveFullCell,
  resolveRowCells,
} from "@/features/data-explorer/table-data/full-cell-resolver";
import {
  buildExport,
  type ExportFormat,
  type SelectedRow,
} from "@/features/data-explorer/table-data/selection-formatters";
import { downloadBlob } from "@/lib/download-blob";
import type {
  TableCell,
  TableResultColumn,
} from "@/protogen/querylane/console/v1alpha1/table_data_pb";

/**
 * Without a full-value source a truncated preview cannot be completed;
 * resolveFullCell turns the missing value into an error, so copies and
 * exports refuse instead of writing a silent prefix.
 */
const noFullCellSource: FetchFullCell = () => Promise.resolve(undefined);

function useSelectionActions({
  cellSelectionStore,
  columns,
  dataColumnStart,
  fetchFullCell = noFullCellSource,
  resourceName,
  resultColumns,
  rows,
  selectedRows,
  setSelectedRows,
}: {
  cellSelectionStore: CellSelectionStore;
  columns: Column<GridRow>[];
  dataColumnStart: number;
  /** Resolves truncated previews; omit when results are never truncated. */
  fetchFullCell?: FetchFullCell | undefined;
  /** Table resource name: export file names and the INSERT target. */
  resourceName: string;
  resultColumns: TableResultColumn[];
  rows: GridRow[];
  selectedRows: ReadonlySet<string>;
  setSelectedRows: (next: ReadonlySet<string>) => void;
}) {
  const clearSelection = () => setSelectedRows(new Set());
  const selected = () =>
    collectSelectedRows({ resultColumns, rows, selectedRows });

  const resolveSelectedRows = (
    selectedForExport: SelectedRow[]
  ): Promise<SelectedRow[]> =>
    Promise.all(
      selectedForExport.map(async (row) => ({
        cells: await resolveRowCells(row.cells, fetchFullCell),
      }))
    );

  const resolveCellSelectionBlocks = (
    blocks: CellSelectionBlocks
  ): Promise<CellSelectionBlocks> =>
    Promise.all(
      blocks.map((block) =>
        Promise.all(
          block.map((row) =>
            Promise.all(row.map((cell) => resolveFullCell(cell, fetchFullCell)))
          )
        )
      )
    );

  const copySelectedCells = (): boolean => {
    const blocks = collectCellSelectionBlocks({
      cellSelectionStore,
      dataColumnKeys: getDisplayedDataColumnKeys(columns),
      dataColumnStart,
      resultColumns,
      rows,
    });
    if (blocks.length === 0) {
      return false;
    }
    const pendingFetches = countCellsNeedingFullValueInBlocks(blocks);
    if (pendingFetches > MAX_SELECTION_FULL_VALUE_FETCHES) {
      toast.error(
        `Cell selection has ${pendingFetches} oversized values — narrow the selection before copying`
      );
      return true;
    }
    if (pendingFetches > 0) {
      writeClipboardDeferred(async () =>
        formatCellSelectionBlocks(await resolveCellSelectionBlocks(blocks))
      );
      return true;
    }
    writeClipboard(formatCellSelectionBlocks(blocks));
    return true;
  };

  // Returns null when there is nothing to export or the selection needs
  // more full-value fetches than the cap allows; the caller must bail.
  const selectionForFullExport = (): {
    rows: Promise<SelectedRow[]>;
  } | null => {
    const selectedForExport = selected();
    if (selectedForExport.length === 0) {
      return null;
    }
    const pendingFetches = countCellsNeedingFullValue(selectedForExport);
    if (pendingFetches > MAX_SELECTION_FULL_VALUE_FETCHES) {
      toast.error(
        `Selection has ${pendingFetches} oversized values — use the toolbar export instead`
      );
      return null;
    }
    return {
      rows:
        pendingFetches > 0
          ? resolveSelectedRows(selectedForExport)
          : Promise.resolve(selectedForExport),
    };
  };

  const buildSelectionExport = (
    exportFormat: ExportFormat,
    exportRows: SelectedRow[]
  ) =>
    buildExport({
      exportFormat,
      rows: exportRows,
      columns: resultColumns,
      resourceName,
    });

  return {
    clearSelection,
    copyCellValue: (row: GridRow, columnKey: string) =>
      copyCellValue({ columnKey, fetchFullCell, resultColumns, row }),
    copyRowAsSqlInsert: (row: GridRow) => {
      const cells = new Map<string, TableCell | undefined>();
      for (const column of resultColumns) {
        cells.set(column.columnName, getGridCell(row, column));
      }
      const buildSql = (sqlCells: Map<string, TableCell | undefined>) =>
        buildSelectionExport("sql", [{ cells: sqlCells }]);
      if ([...cells.values()].some(cellNeedsFullValue)) {
        writeClipboardDeferred(async () => {
          const result = buildSql(await resolveRowCells(cells, fetchFullCell));
          if (!result.ok) {
            reportTruncatedExport(result);
            throw new Error("row contains unrecoverable truncated values");
          }
          return result.payload.contents;
        });
        return;
      }
      const result = buildSql(cells);
      if (!result.ok) {
        reportTruncatedExport(result);
        return;
      }
      writeClipboard(result.payload.contents);
    },
    copyRowValues: (row: GridRow) =>
      copyRowValues(row, resultColumns, fetchFullCell),
    handleCellCopy: (
      { row, column }: CellCopyArgs<GridRow>,
      event?: ClipboardEvent<HTMLDivElement>
    ) => {
      if (hasActiveTextSelectionInsideGrid(event)) {
        return;
      }
      if (copySelectedCells()) {
        return;
      }
      copyCellValue({
        columnKey: column.key,
        fetchFullCell,
        resultColumns,
        row,
      });
    },
    handleCopySelection: (exportFormat: ExportFormat) => {
      const pending = selectionForFullExport();
      if (pending === null) {
        return;
      }
      writeClipboardDeferred(async () => {
        const result = buildSelectionExport(exportFormat, await pending.rows);
        if (!result.ok) {
          reportTruncatedExport(result);
          throw new Error("selection contains unrecoverable truncated values");
        }
        return result.payload.contents;
      });
    },
    handleExportSelection: (exportFormat: ExportFormat) => {
      const pending = selectionForFullExport();
      if (pending === null) {
        return;
      }
      pending.rows
        .then((exportRows) => {
          const result = buildSelectionExport(exportFormat, exportRows);
          if (!result.ok) {
            reportTruncatedExport(result);
            return;
          }
          downloadBlob(
            result.payload.filename,
            result.payload.contents,
            result.payload.mimeType
          );
        })
        .catch(() => toast.error("Couldn't fetch full values for the export"));
    },
  };
}

type SelectionActions = ReturnType<typeof useSelectionActions>;

export type { SelectionActions };
export { useSelectionActions };
