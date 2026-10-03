import { useState } from "react";
import type { ColumnWidth, ColumnWidths } from "react-data-grid";

/**
 * react-data-grid re-measures every `width: "auto"` column it has not seen
 * resized whenever one column is resized while all columns fit (its "flex"
 * mode). Those columns then re-flow to fill the space, so dragging one edge
 * visibly grows or shrinks its neighbours and the dragged column jumps under
 * the pointer. Recording each measured width as `resized` pins it: a drag
 * then changes only the dragged column, like a spreadsheet.
 */
function pinColumnWidths(next: ColumnWidths): ColumnWidths {
  const pinned = new Map<string, ColumnWidth>();
  for (const [key, width] of next) {
    pinned.set(
      key,
      width.type === "resized" ? width : { type: "resized", width: width.width }
    );
  }
  return pinned;
}

const NO_WIDTHS: ColumnWidths = new Map();

/**
 * Controlled column widths for the data grids. The grid stays uncontrolled
 * (`undefined`) until rows are on screen: an empty grid would otherwise pin
 * every column at header width before a streamed result arrives, and a
 * controlled map the caller never updates makes react-data-grid re-sync its
 * internal widths on every render. Pins start over when the column set
 * changes.
 */
function usePinnedColumnWidths({
  columnSignature,
  hasRows,
}: {
  columnSignature: string;
  hasRows: boolean;
}): {
  columnWidths: ColumnWidths | undefined;
  onColumnWidthsChange: ((next: ColumnWidths) => void) | undefined;
} {
  const [state, setState] = useState({
    signature: columnSignature,
    widths: NO_WIDTHS,
  });
  if (!hasRows) {
    return { columnWidths: undefined, onColumnWidthsChange: undefined };
  }
  return {
    columnWidths:
      state.signature === columnSignature ? state.widths : NO_WIDTHS,
    onColumnWidthsChange: (next) =>
      setState({ signature: columnSignature, widths: pinColumnWidths(next) }),
  };
}

export { pinColumnWidths, usePinnedColumnWidths };
