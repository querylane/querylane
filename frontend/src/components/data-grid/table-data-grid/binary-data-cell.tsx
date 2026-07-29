import { create } from "@bufbuild/protobuf";
import { Eye, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { BinaryFilePreview } from "@/components/data-grid/table-data-grid/binary-file-preview";
import {
  type ResolvedCell,
  resolveEffectiveCell,
} from "@/components/data-grid/table-data-grid/record-field-state";
import { Button } from "@/components/ui/button";
import {
  BINARY_PREVIEW_MAX_BYTES,
  cellNeedsFullValue,
} from "@/features/data-explorer/table-data/full-cell-resolver";
import { useReadCellValueMutation } from "@/hooks/api/table-data";
import { formatBytes } from "@/lib/console-resources";
import {
  type ReadCellValueRequest,
  ReadCellValueRequestSchema,
  type ReadCellValueResponse,
  type TableCell,
} from "@/protogen/querylane/console/v1alpha1/table_data_pb";

interface BinaryPreviewResolution {
  bytes: Uint8Array;
  resolvedCell?: ResolvedCell | undefined;
}

interface BinaryPreviewError {
  cell: TableCell;
  message: string;
}

type FetchBinaryCell = (
  request: ReadCellValueRequest
) => Promise<ReadCellValueResponse>;

function getBinaryBytes(cell: TableCell | undefined): Uint8Array | undefined {
  const kind = cell?.value?.kind;
  return kind?.case === "bytesValue" ? kind.value : undefined;
}

async function resolveBinaryPreview({
  cell,
  fetchBinaryCell,
  tableName,
}: {
  cell: TableCell;
  fetchBinaryCell: FetchBinaryCell;
  tableName: string;
}): Promise<BinaryPreviewResolution> {
  if (cell.fullSizeBytes > BINARY_PREVIEW_MAX_BYTES) {
    throw new Error("Value exceeds the binary preview limit");
  }
  if (!cellNeedsFullValue(cell)) {
    const bytes = getBinaryBytes(cell);
    if (!bytes) {
      throw new Error("The value is not binary data");
    }
    return { bytes };
  }
  const token = cell.fullValueToken;
  const response = await fetchBinaryCell(
    create(ReadCellValueRequestSchema, {
      fullValueToken: token,
      maxBytes: BINARY_PREVIEW_MAX_BYTES,
      name: tableName,
    })
  );
  if (!response.value || response.value.truncated) {
    throw new Error("Value exceeds the maximum fetchable size");
  }
  const bytes = getBinaryBytes(response.value);
  if (!bytes) {
    throw new Error("The value is not binary data");
  }
  return {
    bytes,
    resolvedCell: { cell: response.value, fullValueToken: token },
  };
}

function LoadedBinaryDataCell({
  bytes,
  columnName,
  onHide,
}: {
  bytes: Uint8Array;
  columnName: string;
  onHide: () => void;
}) {
  return (
    <Button
      aria-label={`Hide ${columnName} preview`}
      className="h-7 max-w-full px-1.5"
      onClick={onHide}
      size="xs"
      title={`Hide ${columnName} preview`}
      type="button"
      variant="ghost"
    >
      <BinaryFilePreview bytes={bytes} columnName={columnName} variant="grid" />
    </Button>
  );
}

function BinaryPreviewTrigger({
  columnName,
  error,
  isPending,
  isTooLarge,
  onPreview,
  size,
}: {
  columnName: string;
  error: string;
  isPending: boolean;
  isTooLarge: boolean;
  onPreview: () => void;
  size: bigint;
}) {
  return (
    <div className="flex min-w-0 items-center gap-1">
      <span className="shrink-0 text-muted-foreground text-xs">
        ‹{formatBytes(size)}›
      </span>
      <BinaryPreviewAvailability
        columnName={columnName}
        error={error}
        isPending={isPending}
        isTooLarge={isTooLarge}
        onPreview={onPreview}
        size={size}
      />
      {error === "" ? null : (
        <span className="sr-only" role="alert">
          Couldn’t preview {columnName}: {error}. Try again.
        </span>
      )}
    </div>
  );
}

function BinaryPreviewAvailability({
  columnName,
  error,
  isPending,
  isTooLarge,
  onPreview,
  size,
}: {
  columnName: string;
  error: string;
  isPending: boolean;
  isTooLarge: boolean;
  onPreview: () => void;
  size: bigint;
}) {
  if (isTooLarge) {
    return (
      <span
        className="truncate text-muted-foreground text-xs"
        title={`Binary previews are limited to ${formatBytes(
          BINARY_PREVIEW_MAX_BYTES
        )}`}
      >
        Too large to preview
      </span>
    );
  }
  if (size === 0n) {
    return null;
  }
  return (
    <Button
      aria-label={`Preview ${columnName} binary data`}
      className="min-w-0 px-1.5 text-muted-foreground"
      disabled={isPending}
      onClick={onPreview}
      size="xs"
      title={
        error === ""
          ? `Preview ${columnName} binary data`
          : `Preview failed: ${error}`
      }
      type="button"
      variant="ghost"
    >
      {isPending ? (
        <LoaderCircle className="motion-safe:animate-spin" />
      ) : (
        <Eye />
      )}
      {error === "" ? "Preview" : "Retry"}
    </Button>
  );
}

function BinaryDataCell({
  cell,
  columnName,
  tableName,
}: {
  cell: TableCell;
  columnName: string;
  tableName: string;
}) {
  const [resolvedCell, setResolvedCell] = useState<ResolvedCell | undefined>(
    undefined
  );
  const [previewedCell, setPreviewedCell] = useState<TableCell | undefined>(
    undefined
  );
  const [previewErrorState, setPreviewErrorState] = useState<
    BinaryPreviewError | undefined
  >(undefined);
  const fullValueMutation = useReadCellValueMutation();
  const effectiveCell = resolveEffectiveCell(cell, resolvedCell) ?? cell;
  const bytes = getBinaryBytes(effectiveCell);
  const previewError =
    previewErrorState?.cell === cell ? previewErrorState.message : "";
  const size =
    cell.fullSizeBytes > 0n ? cell.fullSizeBytes : BigInt(bytes?.length ?? 0);
  const isTooLarge = size > BINARY_PREVIEW_MAX_BYTES;

  async function showPreview() {
    setPreviewErrorState(undefined);
    try {
      const resolution = await resolveBinaryPreview({
        cell: effectiveCell,
        fetchBinaryCell: fullValueMutation.mutateAsync,
        tableName,
      });
      if (resolution.resolvedCell) {
        setResolvedCell(resolution.resolvedCell);
      }
      setPreviewedCell(cell);
    } catch (error) {
      setPreviewErrorState({
        cell,
        message:
          error instanceof Error
            ? error.message
            : "The binary value didn’t load",
      });
    }
  }

  const visibleBytes =
    previewedCell === cell && bytes && bytes.length > 0 ? bytes : undefined;
  return visibleBytes ? (
    <LoadedBinaryDataCell
      bytes={visibleBytes}
      columnName={columnName}
      onHide={() => setPreviewedCell(undefined)}
    />
  ) : (
    <BinaryPreviewTrigger
      columnName={columnName}
      error={previewError}
      isPending={fullValueMutation.isPending}
      isTooLarge={isTooLarge}
      onPreview={showPreview}
      size={size}
    />
  );
}

export { BinaryDataCell };
