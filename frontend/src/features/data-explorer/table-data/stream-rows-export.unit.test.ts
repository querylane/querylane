import { create } from "@bufbuild/protobuf";
import { createRouterTransport } from "@connectrpc/connect";
import { describe, expect, test, vi } from "vitest";
import type { ExportFormat } from "@/features/data-explorer/table-data/selection-formatters";
import {
  CellValueMode,
  ReadRowsRequestSchema,
  RowOrder_Direction,
  RowOrderSchema,
  StreamRowsBatchSchema,
  StreamRowsMetadataSchema,
  StreamRowsResponseSchema,
  StreamRowsStatsSchema,
  TableCellSchema,
  TableDataService,
  TableResultColumnSchema,
  TableResultRowSchema,
  TableValueSchema,
} from "@/protogen/querylane/console/v1alpha1/table_data_pb";
import { DataType } from "@/protogen/querylane/console/v1alpha1/table_pb";
import {
  buildStreamRowsExportPayload,
  buildStreamRowsExportRequest,
  exportStreamRows,
} from "./stream-rows-export";

const RESOURCE = "instances/i/databases/d/schemas/public/tables/events";
const EVENTS_CSV_FILENAME_PATTERN = /^events_\d{4}-\d{2}-\d{2}\.csv$/;
const EVENTS_JSON_FILENAME_PATTERN = /^events_\d{4}-\d{2}-\d{2}\.json$/;
const EVENTS_SQL_FILENAME_PATTERN = /^events_\d{4}-\d{2}-\d{2}\.sql$/;

const EXPORT_FORMAT_SAVE_PICKER_CASES = [
  {
    acceptMimeType: "text/csv",
    expectedContents: "id\n",
    exportFormat: "csv",
    extension: ".csv",
    filenamePattern: EVENTS_CSV_FILENAME_PATTERN,
    payloadMimeType: "text/csv;charset=utf-8",
  },
  {
    acceptMimeType: "application/json",
    expectedContents: "[]\n",
    exportFormat: "json",
    extension: ".json",
    filenamePattern: EVENTS_JSON_FILENAME_PATTERN,
  },
  {
    acceptMimeType: "application/sql",
    expectedContents: '-- No rows selected for "public"."events"\n',
    exportFormat: "sql",
    extension: ".sql",
    filenamePattern: EVENTS_SQL_FILENAME_PATTERN,
  },
] satisfies Array<{
  acceptMimeType: string;
  expectedContents: string;
  exportFormat: ExportFormat;
  extension: string;
  filenamePattern: RegExp;
  payloadMimeType?: string;
}>;

function streamOf<T>(...items: T[]): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator]() {
      const iterator = items[Symbol.iterator]();
      return {
        next: () => Promise.resolve(iterator.next()),
      };
    },
  };
}

function column(name: string) {
  return create(TableResultColumnSchema, {
    columnName: name,
    dataType: DataType.STRING,
    rawType: "text",
  });
}

function cell(value: string) {
  return create(TableCellSchema, {
    value: create(TableValueSchema, {
      kind: { case: "stringValue", value },
    }),
  });
}

interface SaveFilePickerOptions {
  suggestedName: string;
  types: Array<{
    accept: Record<string, string[]>;
    description: string;
  }>;
}

describe("buildStreamRowsExportRequest", () => {
  test("converts the current grid query into a full-value stream request", () => {
    const request = create(ReadRowsRequestSchema, {
      cellValueMode: CellValueMode.PREVIEW,
      maxCellBytes: 128,
      name: RESOURCE,
      orderBy: [
        create(RowOrderSchema, {
          column: "email",
          direction: RowOrder_Direction.ASC,
        }),
      ],
      pageSize: 50,
      pageToken: "page-2",
      selectedColumns: ["id", "email"],
    });

    const streamRequest = buildStreamRowsExportRequest(request);

    expect(streamRequest).toMatchObject({
      batchSize: 1000,
      cellValueMode: CellValueMode.FULL,
      name: RESOURCE,
      selectedColumns: ["id", "email"],
    });
    expect(streamRequest.maxCellBytes).toBe(0);
    expect(streamRequest.orderBy.map((order) => order.column)).toEqual([
      "email",
    ]);
  });
});

describe("buildStreamRowsExportPayload", () => {
  test("formats streamed metadata and batches with the existing export formatter", async () => {
    const columns = [column("id"), column("email")];
    const stream = streamOf(
      create(StreamRowsResponseSchema, {
        event: {
          case: "metadata",
          value: create(StreamRowsMetadataSchema, { columns }),
        },
      }),
      create(StreamRowsResponseSchema, {
        event: {
          case: "batch",
          value: create(StreamRowsBatchSchema, {
            rows: [
              create(TableResultRowSchema, {
                values: [cell("1"), cell("one@example.com")],
              }),
            ],
          }),
        },
      }),
      create(StreamRowsResponseSchema, {
        event: {
          case: "stats",
          value: create(StreamRowsStatsSchema, {
            rowCount: 1n,
            truncated: true,
          }),
        },
      })
    );
    const onProgress = vi.fn();

    const result = await buildStreamRowsExportPayload({
      exportFormat: "csv",
      onProgress,
      resourceName: RESOURCE,
      stream,
    });

    expect(result.truncated).toBe(true);
    expect(result.rowCount).toBe(1n);
    expect(result.savedToFile).toBe(false);
    expect(result.payload.contents.join("")).toBe(
      "id,email\n1,one@example.com\n"
    );
    expect(onProgress).toHaveBeenCalledWith({
      rowCount: 1n,
      truncated: false,
    });
    expect(onProgress).toHaveBeenCalledWith({
      rowCount: 1n,
      truncated: true,
    });
  });

  test("streams formatted chunks directly to a file sink when available", async () => {
    const columns = [column("id"), column("email")];
    const stream = streamOf(
      create(StreamRowsResponseSchema, {
        event: {
          case: "metadata",
          value: create(StreamRowsMetadataSchema, { columns }),
        },
      }),
      create(StreamRowsResponseSchema, {
        event: {
          case: "batch",
          value: create(StreamRowsBatchSchema, {
            rows: [
              create(TableResultRowSchema, {
                values: [cell("1"), cell("one@example.com")],
              }),
            ],
          }),
        },
      }),
      create(StreamRowsResponseSchema, {
        event: {
          case: "stats",
          value: create(StreamRowsStatsSchema, { rowCount: 1n }),
        },
      })
    );
    const writes: BlobPart[] = [];
    const fileSink = {
      close: vi.fn(),
      write: vi.fn((chunks: readonly BlobPart[]) => {
        writes.push(...chunks);
      }),
    };

    const result = await buildStreamRowsExportPayload({
      exportFormat: "csv",
      fileSink,
      resourceName: RESOURCE,
      stream,
    });

    expect(result.savedToFile).toBe(true);
    expect(result.payload.contents).toEqual([]);
    expect(writes.join("")).toBe("id,email\n1,one@example.com\n");
    expect(
      fileSink.write.mock.calls.some(([chunks]) => chunks.length === 0)
    ).toBe(false);
    expect(fileSink.close).toHaveBeenCalledOnce();
  });

  test("preserves the export error when file sink abort also fails", async () => {
    const columns = [column("id")];
    const exportError = new Error("write failed");
    const abortError = new Error("abort failed");
    const fileSink = {
      abort: vi.fn().mockRejectedValue(abortError),
      close: vi.fn(),
      write: vi.fn().mockRejectedValue(exportError),
    };

    await expect(
      buildStreamRowsExportPayload({
        exportFormat: "csv",
        fileSink,
        resourceName: RESOURCE,
        stream: streamOf(
          create(StreamRowsResponseSchema, {
            event: {
              case: "metadata",
              value: create(StreamRowsMetadataSchema, { columns }),
            },
          })
        ),
      })
    ).rejects.toThrow("write failed");

    expect(fileSink.abort).toHaveBeenCalledOnce();
    expect(fileSink.close).not.toHaveBeenCalled();
  });
});

describe("exportStreamRows", () => {
  test.each(
    EXPORT_FORMAT_SAVE_PICKER_CASES
  )("uses a parameter-free $acceptMimeType MIME type for $exportFormat save picker accept options", async ({
    acceptMimeType,
    expectedContents,
    exportFormat,
    extension,
    filenamePattern,
    payloadMimeType,
  }) => {
    const columns = [column("id")];
    const writes: BlobPart[] = [];
    const writable = {
      abort: vi.fn(),
      close: vi.fn(),
      write: vi.fn((chunk: BlobPart) => {
        writes.push(chunk);
      }),
    };
    const showSaveFilePicker = vi.fn((options: SaveFilePickerOptions) => {
      const acceptTypes = options.types.flatMap((type) =>
        Object.keys(type.accept)
      );
      const invalidType = acceptTypes.find((type) => type.includes(";"));
      if (invalidType) {
        throw new TypeError(`Invalid type: ${invalidType}`);
      }
      return Promise.resolve({
        createWritable: () => Promise.resolve(writable),
      });
    });
    Object.defineProperty(window, "showSaveFilePicker", {
      configurable: true,
      value: showSaveFilePicker,
    });
    const transport = createRouterTransport(({ service }) => {
      service(TableDataService, {
        streamRows: () =>
          streamOf(
            create(StreamRowsResponseSchema, {
              event: {
                case: "metadata",
                value: create(StreamRowsMetadataSchema, { columns }),
              },
            }),
            create(StreamRowsResponseSchema, {
              event: {
                case: "stats",
                value: create(StreamRowsStatsSchema, {
                  rowCount: 0n,
                }),
              },
            })
          ),
      });
    });

    try {
      const result = await exportStreamRows({
        exportFormat,
        request: create(ReadRowsRequestSchema, { name: RESOURCE }),
        transport,
      });

      expect(showSaveFilePicker).toHaveBeenCalledWith(
        expect.objectContaining({
          suggestedName: expect.stringMatching(filenamePattern),
          types: [
            {
              accept: { [acceptMimeType]: [extension] },
              description: "Querylane export",
            },
          ],
        })
      );
      expect(result.savedToFile).toBe(true);
      if (payloadMimeType) {
        expect(result.payload.mimeType).toBe(payloadMimeType);
      }
      expect(writes.join("")).toBe(expectedContents);
    } finally {
      Reflect.deleteProperty(window, "showSaveFilePicker");
    }
  });
});
