import { create } from "@bufbuild/protobuf";
import {
  Check,
  Copy,
  Download,
  Expand,
  Eye,
  EyeOff,
  KeyRound,
  Minus,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { BinaryFilePreview } from "@/components/data-grid/table-data-grid/binary-file-preview";
import {
  writeClipboard,
  writeClipboardDeferred,
} from "@/components/data-grid/table-data-grid/grid-clipboard";
import {
  buildByteaDownloadFilename,
  type ResolvedCell,
  resolveEffectiveCell,
} from "@/components/data-grid/table-data-grid/record-field-state";
import { Button } from "@/components/ui/button";
import { detectBinaryFile } from "@/features/data-explorer/table-data/binary-file";
import {
  BINARY_PREVIEW_MAX_BYTES,
  cellNeedsFullValue,
  READ_CELL_MAX_BYTES,
} from "@/features/data-explorer/table-data/full-cell-resolver";
import {
  keyPostgresArrayItems,
  parsePostgresArrayLiteral,
} from "@/features/data-explorer/table-data/postgres-array";
import { formatCellForClipboard } from "@/features/data-explorer/table-data/selection-formatters";
import {
  type FormattedCell,
  formatTableCell,
} from "@/features/data-explorer/table-data/table-value-format";
import { useReadCellValueMutation } from "@/hooks/api/table-data";
import { parseTableQualifiedName } from "@/lib/console-resources";
import { downloadBlob } from "@/lib/download-blob";
import { cn } from "@/lib/utils";
import {
  ReadCellValueRequestSchema,
  type TableCell,
  type TableResultColumn,
} from "@/protogen/querylane/console/v1alpha1/table_data_pb";
import { DataType } from "@/protogen/querylane/console/v1alpha1/table_pb";

const JSON_PRETTY_PARSE_MAX_LENGTH = 100_000;

interface RecordFieldProps {
  cell: TableCell | undefined;
  column: TableResultColumn;
  isPrimaryKey: boolean;
  rowIdentifier?: string | undefined;
  tableName: string;
}

function getBinaryPreviewInfo(cell: TableCell | undefined, isBinary: boolean) {
  const kind = cell?.value?.kind;
  const bytes = kind?.case === "bytesValue" ? kind.value : undefined;
  const declaredSize = cell?.fullSizeBytes ?? 0n;
  const size = declaredSize > 0n ? declaredSize : BigInt(bytes?.length ?? 0);
  return {
    bytes,
    canPreview:
      isBinary &&
      size <= BINARY_PREVIEW_MAX_BYTES &&
      (cell?.truncated === true || (bytes?.length ?? 0) > 0),
    isTooLarge: isBinary && size > BINARY_PREVIEW_MAX_BYTES,
  };
}

async function requireBinaryPreviewCell(
  cell: TableCell | undefined,
  fetchFullCell: () => Promise<TableCell>
): Promise<TableCell> {
  const full = cellNeedsFullValue(cell) ? await fetchFullCell() : cell;
  if (full?.value?.kind.case !== "bytesValue") {
    throw new Error("The value is not binary data");
  }
  return full;
}

function RecordFieldMetadata({
  column,
  isPrimaryKey,
}: {
  column: TableResultColumn;
  isPrimaryKey: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
      <span className="min-w-0 break-all font-medium font-mono text-foreground text-xs">
        {column.columnName}
      </span>
      {isPrimaryKey ? (
        <span className="text-amber-600 dark:text-amber-400">
          <KeyRound
            aria-hidden={true}
            className="mr-0.5 inline size-3 align-[-0.15em]"
          />
          <span className="font-medium text-[0.625rem] uppercase tracking-wide">
            PK
          </span>
        </span>
      ) : null}
      <span className="font-mono text-[0.625rem] text-muted-foreground uppercase tracking-wide">
        {column.rawType}
      </span>
      <span className="text-[0.625rem] text-muted-foreground uppercase tracking-wide">
        {column.isNullable ? "nullable" : "not null"}
      </span>
    </div>
  );
}

interface RecordFieldActionsProps {
  columnName: string;
  copyAction: { handleClick: () => void } | null;
  downloadAction: { handleClick: () => void } | null;
  isPending: boolean;
  loadFullValueAction: { handleClick: () => void } | null;
  previewAction: { handleClick: () => void; isVisible: boolean } | null;
}

type RecordFieldActionOptions = Omit<
  RecordFieldActionsProps,
  "columnName" | "isPending"
>;

function createRecordFieldActionOptions({
  canCopy,
  canDownload,
  canExpand,
  canPreviewBinary,
  isBinaryPreviewVisible,
  onBinaryPreview,
  onCopy,
  onDownload,
  onLoadFullValue,
}: {
  canCopy: boolean;
  canDownload: boolean;
  canExpand: boolean;
  canPreviewBinary: boolean;
  isBinaryPreviewVisible: boolean;
  onBinaryPreview: () => void;
  onCopy: () => void;
  onDownload: () => void;
  onLoadFullValue: () => void;
}): RecordFieldActionOptions {
  return {
    copyAction: canCopy ? { handleClick: onCopy } : null,
    downloadAction: canDownload ? { handleClick: onDownload } : null,
    loadFullValueAction: canExpand ? { handleClick: onLoadFullValue } : null,
    previewAction: canPreviewBinary
      ? {
          handleClick: onBinaryPreview,
          isVisible: isBinaryPreviewVisible,
        }
      : null,
  };
}

function RecordFieldActions({
  columnName,
  copyAction,
  downloadAction,
  isPending,
  loadFullValueAction,
  previewAction,
}: RecordFieldActionsProps) {
  return (
    <div className="flex shrink-0 flex-col items-center gap-0.5">
      {previewAction ? (
        <Button
          aria-label={
            previewAction.isVisible
              ? `Hide ${columnName} preview`
              : `Preview ${columnName}`
          }
          className="shrink-0 text-muted-foreground"
          disabled={isPending}
          onClick={previewAction.handleClick}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          {previewAction.isVisible ? <EyeOff /> : <Eye />}
        </Button>
      ) : null}
      {loadFullValueAction ? (
        <Button
          aria-label={`Load full value for ${columnName}`}
          className="shrink-0 text-muted-foreground"
          disabled={isPending}
          onClick={loadFullValueAction.handleClick}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <Expand />
        </Button>
      ) : null}
      {copyAction ? (
        <Button
          aria-label={`Copy ${columnName}`}
          className="shrink-0 text-muted-foreground"
          onClick={copyAction.handleClick}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <Copy />
        </Button>
      ) : null}
      {downloadAction ? (
        <Button
          aria-label={`Download ${columnName}`}
          className="shrink-0 text-muted-foreground"
          disabled={isPending}
          onClick={downloadAction.handleClick}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <Download />
        </Button>
      ) : null}
    </div>
  );
}

function RecordFieldErrors({
  binaryPreviewError,
  columnName,
  fullValueError,
}: {
  binaryPreviewError: string;
  columnName: string;
  fullValueError: boolean;
}) {
  return (
    <>
      {fullValueError ? (
        <p className="text-destructive-foreground/80 text-xs">
          Couldn’t load the full value. Try again.
        </p>
      ) : null}
      {binaryPreviewError === "" ? null : (
        <p className="text-destructive-foreground/80 text-xs" role="alert">
          Couldn’t preview {columnName}: {binaryPreviewError}. Try again.
        </p>
      )}
    </>
  );
}

function RecordField({
  cell,
  column,
  isPrimaryKey,
  rowIdentifier,
  tableName,
}: RecordFieldProps) {
  const [resolved, setResolved] = useState<ResolvedCell | undefined>(undefined);
  const [binaryPreviewCell, setBinaryPreviewCell] = useState<
    TableCell | undefined
  >(undefined);
  const [binaryPreviewError, setBinaryPreviewError] = useState("");
  const fullValueMutation = useReadCellValueMutation();
  const effectiveCell = resolveEffectiveCell(cell, resolved);
  const formatted = formatTableCell(effectiveCell, column);
  const isBinaryPreviewVisible = binaryPreviewCell === cell;
  const isBinary = column.dataType === DataType.BINARY;
  const binaryPreview = getBinaryPreviewInfo(effectiveCell, isBinary);
  const canExpand =
    !isBinary &&
    effectiveCell?.truncated === true &&
    effectiveCell.fullValueToken !== "";
  const isEmptyString = formatted.kind === "text" && formatted.display === "";
  const canCopy = !(formatted.isNull || isEmptyString);
  const canDownload = isBinary && !formatted.isNull;
  const canPreviewBinary = canDownload && binaryPreview.canPreview;
  async function fetchFullCell(
    maxBytes: bigint = READ_CELL_MAX_BYTES
  ): Promise<TableCell> {
    const token = effectiveCell?.fullValueToken ?? "";
    const response = await fullValueMutation.mutateAsync(
      create(ReadCellValueRequestSchema, {
        fullValueToken: token,
        maxBytes,
        name: tableName,
      })
    );
    const full = response.value;
    if (!full || full.truncated) {
      throw new Error("Value exceeds the maximum fetchable size");
    }
    setResolved({ cell: full, fullValueToken: token });
    return full;
  }
  function handleCopy() {
    if (!canCopy) {
      return;
    }
    if (cellNeedsFullValue(effectiveCell)) {
      writeClipboardDeferred(async () =>
        formatCellForClipboard(await fetchFullCell())
      );
      return;
    }
    writeClipboard(formatCellForClipboard(effectiveCell));
  }
  function handleDownload() {
    if (!effectiveCell) {
      return;
    }
    const fullPromise = cellNeedsFullValue(effectiveCell)
      ? fetchFullCell()
      : Promise.resolve(effectiveCell);
    fullPromise
      .then((full) => {
        const kind = full.value?.kind;
        if (kind?.case !== "bytesValue") {
          return;
        }
        const file = detectBinaryFile(kind.value);
        const filename = buildByteaDownloadFilename({
          columnName: column.columnName,
          extension: file.extension,
          rowIdentifier,
          table: parseTableQualifiedName(tableName).table,
        });
        // Copy into a fresh ArrayBuffer-backed view: protobuf-es types its
        // bytes as Uint8Array<ArrayBufferLike>, which BlobPart rejects.
        downloadBlob(filename, new Uint8Array(kind.value), file.mimeType);
      })
      .catch(() => toast.error("Couldn't download the value"));
  }
  function handleLoadFullValue() {
    if (!(effectiveCell && canExpand)) {
      return;
    }
    fullValueMutation.mutate(
      create(ReadCellValueRequestSchema, {
        fullValueToken: effectiveCell.fullValueToken,
        name: tableName,
      }),
      {
        onSuccess: (response) => {
          if (response.value) {
            setResolved({
              cell: response.value,
              fullValueToken: effectiveCell.fullValueToken,
            });
          }
        },
      }
    );
  }
  async function handleBinaryPreview() {
    if (isBinaryPreviewVisible) {
      setBinaryPreviewCell(undefined);
      return;
    }
    setBinaryPreviewError("");
    try {
      await requireBinaryPreviewCell(effectiveCell, () =>
        fetchFullCell(BINARY_PREVIEW_MAX_BYTES)
      );
      setBinaryPreviewCell(cell);
    } catch (error) {
      setBinaryPreviewError(
        error instanceof Error ? error.message : "The binary value didn’t load"
      );
    }
  }
  const actionOptions = createRecordFieldActionOptions({
    canCopy,
    canDownload,
    canExpand,
    canPreviewBinary,
    isBinaryPreviewVisible,
    onBinaryPreview: handleBinaryPreview,
    onCopy: handleCopy,
    onDownload: handleDownload,
    onLoadFullValue: handleLoadFullValue,
  });
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <RecordFieldMetadata column={column} isPrimaryKey={isPrimaryKey} />
      <div className="grid grid-cols-[minmax(0,1fr)_2rem] items-start gap-1">
        <div
          className="flex min-h-8 min-w-0 items-center overflow-hidden rounded-md border bg-muted/30 px-2.5 py-1"
          data-slot="record-field-value"
        >
          {isBinaryPreviewVisible && binaryPreview.bytes ? (
            <BinaryFilePreview
              bytes={binaryPreview.bytes}
              columnName={column.columnName}
            />
          ) : (
            <RecordFieldValue formatted={formatted} />
          )}
        </div>
        <RecordFieldActions
          {...actionOptions}
          columnName={column.columnName}
          isPending={fullValueMutation.isPending}
        />
      </div>
      <RecordFieldErrors
        binaryPreviewError={binaryPreviewError}
        columnName={column.columnName}
        fullValueError={fullValueMutation.isError}
      />
      {binaryPreview.isTooLarge ? (
        <p className="text-muted-foreground text-xs">
          Too large to preview. Download the value instead.
        </p>
      ) : null}
    </div>
  );
}
function RecordFieldValue({ formatted }: { formatted: FormattedCell }) {
  if (formatted.kind === "text" && formatted.display === "") {
    return <span className="text-muted-foreground text-xs">Empty string</span>;
  }
  if (formatted.isNull) {
    return (
      <span className="text-muted-foreground italic">{formatted.display}</span>
    );
  }
  switch (formatted.kind) {
    case "bool":
      return (
        <span className="inline-flex items-center gap-1.5 font-mono text-xs">
          {formatted.display === "true" ? (
            <Check
              aria-hidden={true}
              className="size-3 text-emerald-500 dark:text-emerald-400"
            />
          ) : (
            <Minus
              aria-hidden={true}
              className="size-3 text-muted-foreground"
            />
          )}
          {formatted.display}
        </span>
      );
    case "number":
      return (
        <span className="font-mono text-xs tabular-nums">
          {formatted.display}
        </span>
      );
    case "timestamp":
    case "date":
      return (
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <span className="font-mono text-xs tabular-nums">
            {formatted.display}
          </span>
        </span>
      );
    case "array":
      return <ArrayValue raw={formatted.display} />;
    case "json":
      return <JsonValue raw={formatted.display} />;
    case "bytes":
      return (
        <span className="font-mono text-muted-foreground text-xs">
          {formatted.display}
        </span>
      );
    default:
      return (
        <pre
          className={cn(
            "max-h-96 w-full overflow-auto whitespace-pre-wrap break-all",
            "font-mono text-xs"
          )}
        >
          {formatted.display}
        </pre>
      );
  }
}

function ArrayValue({ raw }: { raw: string }) {
  const parsed = parsePostgresArrayLiteral(raw);
  if (!parsed.ok) {
    return (
      <pre
        className={cn(
          "max-h-96 w-full overflow-auto whitespace-pre-wrap break-all",
          "font-mono text-sky-700 text-xs dark:text-sky-300"
        )}
      >
        {raw}
      </pre>
    );
  }
  const count = parsed.items.length;
  const keyedItems = keyPostgresArrayItems(parsed.items);
  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="rounded-full border border-sky-500/25 bg-sky-500/10 px-1.5 py-0.5 font-medium text-sky-700 text-xs leading-none dark:text-sky-300">
          {count.toLocaleString()} {count === 1 ? "item" : "items"}
        </span>
      </div>
      {count === 0 ? (
        <span className="text-muted-foreground text-xs">Empty array</span>
      ) : (
        <ol className="max-h-96 w-full overflow-auto rounded-md border bg-background/60">
          {keyedItems.map(({ item, key, position }) => (
            <li
              className="grid grid-cols-[3rem_minmax(0,1fr)] gap-2 border-b px-2.5 py-2 last:border-b-0"
              key={key}
            >
              <span className="font-mono text-muted-foreground text-xs tabular-nums">
                {position}
              </span>
              {item.isNull ? (
                <span className="text-muted-foreground text-xs italic">
                  SQL NULL
                </span>
              ) : (
                <code className="break-all font-mono text-sky-700 text-xs dark:text-sky-300">
                  {item.display}
                </code>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function JsonValue({ raw }: { raw: string }) {
  let pretty = raw;
  if (raw.length <= JSON_PRETTY_PARSE_MAX_LENGTH) {
    try {
      pretty = JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      // not valid JSON — fall back to raw string
    }
  }
  return (
    <pre
      className={cn(
        "max-h-96 w-full overflow-auto whitespace-pre-wrap break-all",
        "font-mono text-violet-600 text-xs",
        "dark:text-violet-400"
      )}
    >
      {pretty}
    </pre>
  );
}

export { RecordField };
