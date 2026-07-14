import { create } from "@bufbuild/protobuf";
import { createClient, type Transport } from "@connectrpc/connect";
import {
  type ChunkedExportPayload,
  createChunkedExportBuilder,
  type ExportFileDetails,
  type ExportFormat,
  getExportFileDetails,
  type SelectedRow,
} from "@/features/data-explorer/table-data/selection-formatters";
import { assertNever } from "@/lib/assert-never";
import {
  CellValueMode,
  type ReadRowsRequest,
  type StreamRowsRequest,
  StreamRowsRequestSchema,
  type StreamRowsResponse,
  TableDataService,
  type TableResultColumn,
  type TableResultRow,
} from "@/protogen/querylane/console/v1alpha1/table_data_pb";

const STREAM_ROWS_EXPORT_BATCH_SIZE = 1000;

type ChunkedExportBuilder = ReturnType<typeof createChunkedExportBuilder>;

interface StreamRowsExportPayloadArgs {
  exportFormat: ExportFormat;
  fileSink?: ExportFileSink | undefined;
  onProgress?: ((progress: StreamRowsExportProgress) => void) | undefined;
  resourceName: string;
  stream: AsyncIterable<StreamRowsResponse>;
}

interface StreamRowsExportPayloadResult {
  payload: ChunkedExportPayload;
  rowCount: bigint;
  savedToFile: boolean;
  truncated: boolean;
}

interface StreamRowsExportProgress {
  rowCount: bigint;
  truncated: boolean;
}

interface ExportFileSink {
  abort?: (() => Promise<void> | void) | undefined;
  close: () => Promise<void> | void;
  write: (chunks: readonly BlobPart[]) => Promise<void> | void;
}

interface FileSystemWritableFileStreamLike {
  abort?: (() => Promise<void>) | undefined;
  close: () => Promise<void>;
  write: (data: BlobPart) => Promise<void>;
}

interface FileSystemFileHandleLike {
  createWritable: () => Promise<FileSystemWritableFileStreamLike>;
}

interface WindowWithSaveFilePicker {
  showSaveFilePicker?: (options: {
    suggestedName: string;
    types: Array<{
      accept: Record<string, string[]>;
      description: string;
    }>;
  }) => Promise<FileSystemFileHandleLike>;
}

function buildStreamRowsExportRequest(
  request: ReadRowsRequest
): StreamRowsRequest {
  return create(StreamRowsRequestSchema, {
    batchSize: STREAM_ROWS_EXPORT_BATCH_SIZE,
    cellValueMode: CellValueMode.FULL,
    ...(request.filter ? { filter: request.filter } : {}),
    name: request.name,
    orderBy: [...request.orderBy],
    selectedColumns: [...request.selectedColumns],
  });
}

function rowToSelectedRow(
  row: TableResultRow,
  columns: TableResultColumn[]
): SelectedRow {
  return {
    cells: new Map(
      columns.map((column, index) => [column.columnName, row.values[index]])
    ),
  };
}

async function buildStreamRowsExportPayload(
  args: StreamRowsExportPayloadArgs
): Promise<StreamRowsExportPayloadResult> {
  try {
    return await buildStreamRowsExportPayloadUnsafe(args);
  } catch (error) {
    await abortFileSink(args.fileSink);
    throw error;
  }
}

async function abortFileSink(fileSink: ExportFileSink | undefined) {
  try {
    await fileSink?.abort?.();
  } catch {
    // Keep the original stream/export error. Writable abort failures are
    // cleanup failures and should not replace the user-visible cause.
  }
}

async function writeFileChunks(
  fileSink: ExportFileSink | undefined,
  chunks: readonly BlobPart[]
) {
  if (!(fileSink && chunks.length > 0)) {
    return;
  }

  await fileSink.write(chunks);
}

async function writeDrainedFileChunks(
  fileSink: ExportFileSink | undefined,
  builder: ChunkedExportBuilder
) {
  if (!fileSink) {
    return;
  }

  await writeFileChunks(fileSink, builder.drainChunks());
}

async function buildStreamRowsExportPayloadUnsafe({
  exportFormat,
  fileSink,
  onProgress,
  resourceName,
  stream,
}: StreamRowsExportPayloadArgs): Promise<StreamRowsExportPayloadResult> {
  let columns: TableResultColumn[] | undefined;
  let rowCount = 0n;
  let streamedRowCount = 0n;
  let truncated = false;
  let builder: ChunkedExportBuilder | undefined;

  for await (const response of stream) {
    switch (response.event.case) {
      case "metadata":
        ({ columns } = response.event.value);
        builder = createChunkedExportBuilder(
          exportFormat,
          columns,
          resourceName
        );
        await writeDrainedFileChunks(fileSink, builder);
        break;
      case "batch": {
        const batchColumns = columns;
        const batchBuilder = builder;
        if (!(batchColumns && batchBuilder)) {
          throw new Error("StreamRows batch arrived before metadata");
        }
        const selectedRows = response.event.value.rows.map((row) =>
          rowToSelectedRow(row, batchColumns)
        );
        batchBuilder.addRows(selectedRows);
        await writeDrainedFileChunks(fileSink, batchBuilder);
        streamedRowCount += BigInt(selectedRows.length);
        onProgress?.({ rowCount: streamedRowCount, truncated: false });
        break;
      }
      case "stats":
        ({ rowCount, truncated } = response.event.value);
        onProgress?.({ rowCount, truncated });
        break;
      case undefined:
        break;
      default:
        assertNever(response.event);
    }
  }

  if (!columns) {
    throw new Error("StreamRows did not emit metadata");
  }

  if (!builder) {
    throw new Error("StreamRows did not prepare an export writer");
  }

  const result = builder.finish();
  if (!result.ok) {
    throw new Error(
      `Cannot export streamed rows because ${result.truncatedRowCount.toLocaleString()} rows contain truncated values`
    );
  }

  if (fileSink) {
    await writeFileChunks(fileSink, result.payload.contents);
    await fileSink.close();
    return {
      payload: { ...result.payload, contents: [] },
      rowCount,
      savedToFile: true,
      truncated,
    };
  }

  return {
    payload: result.payload,
    rowCount,
    savedToFile: false,
    truncated,
  };
}

async function createBrowserFileSink(
  details: ExportFileDetails
): Promise<ExportFileSink | undefined> {
  if (typeof window === "undefined") {
    return;
  }

  const { showSaveFilePicker } = window as WindowWithSaveFilePicker;
  if (!showSaveFilePicker) {
    return;
  }

  const [acceptMimeType] = details.mimeType.split(";");
  const handle = await showSaveFilePicker({
    suggestedName: details.filename,
    types: [
      {
        accept: {
          [acceptMimeType?.trim() || "application/octet-stream"]:
            details.extensions,
        },
        description: "Querylane export",
      },
    ],
  });
  const writable = await handle.createWritable();

  async function writeChunks(
    chunks: readonly BlobPart[],
    index = 0
  ): Promise<void> {
    const chunk = chunks[index];
    if (chunk === undefined) {
      return;
    }
    await writable.write(chunk);
    await writeChunks(chunks, index + 1);
  }

  return {
    abort: () => writable.abort?.(),
    close: () => writable.close(),
    write: writeChunks,
  };
}

async function exportStreamRows({
  exportFormat,
  onProgress,
  request,
  signal,
  transport,
}: {
  exportFormat: ExportFormat;
  onProgress?: ((progress: StreamRowsExportProgress) => void) | undefined;
  request: ReadRowsRequest;
  signal?: AbortSignal | undefined;
  transport: Transport;
}): Promise<StreamRowsExportPayloadResult> {
  const streamRequest = buildStreamRowsExportRequest(request);
  const fileSink = await createBrowserFileSink(
    getExportFileDetails(exportFormat, streamRequest.name)
  );
  // timeoutMs: 0 disables the transport's default deadline: an export can
  // legitimately stream for minutes and is user-cancellable via the signal.
  const callOptions = signal ? { signal, timeoutMs: 0 } : { timeoutMs: 0 };
  const stream = createClient(TableDataService, transport).streamRows(
    streamRequest,
    callOptions
  );

  return buildStreamRowsExportPayload({
    exportFormat,
    fileSink,
    onProgress,
    resourceName: streamRequest.name,
    stream,
  });
}

export type { StreamRowsExportPayloadResult, StreamRowsExportProgress };
export {
  buildStreamRowsExportPayload,
  buildStreamRowsExportRequest,
  exportStreamRows,
};
