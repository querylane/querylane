import { create } from "@bufbuild/protobuf";
import { durationFromMs } from "@bufbuild/protobuf/wkt";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  type ExecuteQueryResponse,
  ExecuteQueryResponseSchema,
  ExplainQueryResponseSchema,
} from "@/protogen/querylane/console/v1alpha1/sql_pb";
import { DataType } from "@/protogen/querylane/console/v1alpha1/table_pb";
import { SqlWorkbenchPage } from "./sql-workbench-page";

const RUN_BUTTON_NAME = /run/i;
const COMPOSITE_INDEX_INSIGHT_RE = /composite index could remove/i;
const BUFFERS_READ_FROM_DISK_RE = /buffers read from disk/i;
const EXPLAIN_ANALYZE_BUFFERS_RE = /EXPLAIN \(ANALYZE, BUFFERS\)/;
const VERBOSE_RE = /VERBOSE/;

const apiMocks = vi.hoisted(() => ({
  executeWorkbenchQuery: vi.fn(),
  explainWorkbenchQuery: vi.fn(),
}));

vi.mock("@/hooks/api/sql", () => apiMocks);

function streamResponses(
  responses: ExecuteQueryResponse[]
): AsyncIterable<ExecuteQueryResponse> {
  return {
    async *[Symbol.asyncIterator]() {
      await Promise.resolve();
      for (const response of responses) {
        yield response;
      }
    },
  };
}

function queryResponseStream() {
  return streamResponses([
    create(ExecuteQueryResponseSchema, {
      result: {
        case: "columnMetadata",
        value: {
          columns: [
            {
              columnName: "ref",
              dataType: DataType.STRING,
              isNullable: false,
              mayTruncate: false,
              rawType: "TEXT",
            },
          ],
        },
      },
    }),
    create(ExecuteQueryResponseSchema, {
      result: {
        case: "rowBatch",
        value: {
          rows: [
            {
              rowKey: "row-1",
              values: [
                {
                  fullSizeBytes: 0n,
                  fullValueToken: "",
                  truncated: false,
                  value: {
                    kind: { case: "stringValue", value: "ML-test" },
                  },
                },
              ],
            },
          ],
        },
      },
    }),
    create(ExecuteQueryResponseSchema, {
      result: {
        case: "stats",
        value: {
          latency: durationFromMs(12),
          notices: [],
          rowCount: 1n,
          truncated: false,
        },
      },
    }),
  ]);
}

function truncatedDuplicateColumnStream() {
  return streamResponses([
    create(ExecuteQueryResponseSchema, {
      result: {
        case: "columnMetadata",
        value: {
          columns: [
            {
              columnName: "id",
              dataType: DataType.STRING,
              isNullable: false,
              mayTruncate: false,
              rawType: "TEXT",
            },
            {
              columnName: "id",
              dataType: DataType.STRING,
              isNullable: false,
              mayTruncate: false,
              rawType: "TEXT",
            },
          ],
        },
      },
    }),
    create(ExecuteQueryResponseSchema, {
      result: {
        case: "rowBatch",
        value: {
          rows: [
            {
              rowKey: "row-1",
              values: [
                {
                  value: { kind: { case: "stringValue", value: "left-id" } },
                },
                {
                  value: { kind: { case: "stringValue", value: "right-id" } },
                },
              ],
            },
          ],
        },
      },
    }),
    create(ExecuteQueryResponseSchema, {
      result: {
        case: "stats",
        value: {
          latency: durationFromMs(9),
          notices: ["NOTICE: using a fallback plan"],
          rowCount: 1000n,
          truncated: true,
        },
      },
    }),
  ]);
}

describe("SqlWorkbenchPage", () => {
  beforeEach(() => {
    apiMocks.executeWorkbenchQuery.mockReset();
    apiMocks.explainWorkbenchQuery.mockReset();
  });

  test("renders the read-only workbench shell", () => {
    render(
      <SqlWorkbenchPage databaseId="logistics" instanceId="prod-core-eu" />
    );

    expect(screen.getByRole("heading", { name: "SQL workbench" })).toBeTruthy();
    expect(screen.getByText("read-only guard")).toBeTruthy();
    expect(screen.getByRole("button", { name: RUN_BUTTON_NAME })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Results" })).toBeTruthy();
    expect(
      screen.getByText("Run a read-only query to see results")
    ).toBeTruthy();
    expect(screen.getByText("No saved queries yet")).toBeTruthy();
    expect(screen.getByText("No query history yet")).toBeTruthy();
    expect(screen.queryByText("Customs holds by carrier")).toBeNull();
  });

  test("renders metrics and nodes from the live explain response", async () => {
    apiMocks.explainWorkbenchQuery.mockResolvedValue(
      create(ExplainQueryResponseSchema, {
        latency: durationFromMs(4.2),
        plan: "Seq Scan on public.customers  (cost=0.00..12.50 rows=250 width=8) (actual time=0.02..3.80 rows=200 loops=1)\n  Buffers: shared hit=12 read=2\nPlanning Time: 0.20 ms\nExecution Time: 3.90 ms",
      })
    );
    const user = userEvent.setup();

    render(
      <SqlWorkbenchPage databaseId="logistics" instanceId="prod-core-eu" />
    );
    await user.click(screen.getByRole("button", { name: "Explain" }));

    expect(
      await screen.findByText("Seq Scan on public.customers")
    ).toBeTruthy();
    expect(screen.getByText("3.90 ms")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Insights 3" })).toBeTruthy();
    expect(screen.queryByText(COMPOSITE_INDEX_INSIGHT_RE)).toBeNull();
  });

  test("counts only insights supported by the explain response", async () => {
    apiMocks.explainWorkbenchQuery.mockResolvedValue(
      create(ExplainQueryResponseSchema, {
        latency: durationFromMs(1),
        plan: "Seq Scan on public.customers  (cost=0.00..12.50 rows=250 width=8) (actual time=0.02..0.80 rows=200 loops=1)\nPlanning Time: 0.10 ms\nExecution Time: 0.90 ms",
      })
    );
    const user = userEvent.setup();
    render(
      <SqlWorkbenchPage databaseId="logistics" instanceId="prod-core-eu" />
    );

    await user.click(screen.getByRole("button", { name: "Explain" }));

    expect(
      await screen.findByRole("button", { name: "Insights 2" })
    ).toBeTruthy();
    expect(screen.queryByText(BUFFERS_READ_FROM_DISK_RE)).toBeNull();
  });

  test("streams read-only query results after Run", async () => {
    apiMocks.executeWorkbenchQuery.mockReturnValue(queryResponseStream());
    const user = userEvent.setup();

    render(
      <SqlWorkbenchPage databaseId="logistics" instanceId="prod-core-eu" />
    );
    await user.click(screen.getByRole("button", { name: RUN_BUTTON_NAME }));

    await waitFor(() => {
      expect(apiMocks.executeWorkbenchQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          parent: "instances/prod-core-eu/databases/logistics",
          rowLimit: 1000,
        })
      );
    });
    expect(await screen.findByText("ML-test")).toBeTruthy();
  });

  test("keeps result attribution stable and surfaces truncation and notices", async () => {
    apiMocks.executeWorkbenchQuery.mockReturnValue(
      truncatedDuplicateColumnStream()
    );
    const user = userEvent.setup();

    render(
      <SqlWorkbenchPage databaseId="logistics" instanceId="prod-core-eu" />
    );
    await user.click(screen.getByRole("button", { name: RUN_BUTTON_NAME }));

    expect(
      await screen.findByText("Results limited to 1,000 rows")
    ).toBeTruthy();
    expect(screen.getByText("NOTICE: using a fallback plan")).toBeTruthy();
    const headers = screen.getAllByRole("columnheader", { name: "id" });
    expect(headers).toHaveLength(2);
    for (const header of headers) {
      expect(header).toHaveProperty("scope", "col");
    }

    const executedStatement = screen.getByLabelText("Executed statement");
    const statementAtExecution = executedStatement.textContent;
    await user.clear(screen.getByLabelText("SQL statement"));
    await user.type(screen.getByLabelText("SQL statement"), "SELECT 2");
    expect(executedStatement.textContent).toBe(statementAtExecution);
  });

  test("exposes the active workbench mode and disables hidden-query actions", async () => {
    const user = userEvent.setup();
    render(
      <SqlWorkbenchPage databaseId="logistics" instanceId="prod-core-eu" />
    );

    const editorTab = screen.getByRole("tab", { name: "SQL editor" });
    const builderTab = screen.getByRole("tab", { name: "Visual builder" });
    expect(editorTab.getAttribute("aria-selected")).toBe("true");
    await user.click(builderTab);
    expect(builderTab.getAttribute("aria-selected")).toBe("true");
    const runButton = screen.getByRole("button", { name: RUN_BUTTON_NAME });
    expect(runButton).toBeInstanceOf(HTMLButtonElement);
    if (runButton instanceof HTMLButtonElement) {
      expect(runButton.disabled).toBe(true);
    }
    const saveButton = screen.getByRole("button", { name: "Save query" });
    const fullScreenButton = screen.getByRole("button", {
      name: "Enter full screen (coming soon)",
    });
    expect(saveButton).toBeInstanceOf(HTMLButtonElement);
    expect(fullScreenButton).toBeInstanceOf(HTMLButtonElement);
    if (
      saveButton instanceof HTMLButtonElement &&
      fullScreenButton instanceof HTMLButtonElement
    ) {
      expect(saveButton.disabled).toBe(true);
      expect(fullScreenButton.disabled).toBe(true);
    }
  });

  test("uses truthful explain labels and derives an empty insight count", async () => {
    apiMocks.explainWorkbenchQuery.mockResolvedValue(
      create(ExplainQueryResponseSchema, {
        latency: durationFromMs(1),
        plan: "Planning Time: 0.10 ms\nExecution Time: 0.50 ms",
      })
    );
    const user = userEvent.setup();
    render(
      <SqlWorkbenchPage databaseId="logistics" instanceId="prod-core-eu" />
    );

    await user.click(screen.getByRole("button", { name: "Explain" }));
    const insights = await screen.findByRole("button", { name: "Insights 0" });
    expect(insights).toBeInstanceOf(HTMLButtonElement);
    if (insights instanceof HTMLButtonElement) {
      expect(insights.disabled).toBe(true);
    }
    await user.click(screen.getByRole("button", { name: "Text" }));
    expect(
      screen.getByRole("heading", { name: EXPLAIN_ANALYZE_BUFFERS_RE })
    ).toBeTruthy();
    expect(screen.queryByText(VERBOSE_RE)).toBeNull();
  });

  test("disables Run for write-looking SQL before it reaches the backend", async () => {
    const user = userEvent.setup();

    render(
      <SqlWorkbenchPage databaseId="logistics" instanceId="prod-core-eu" />
    );
    await user.clear(screen.getByLabelText("SQL statement"));
    await user.type(
      screen.getByLabelText("SQL statement"),
      "DELETE FROM shipping.shipments"
    );

    const runButton = screen.getByRole("button", { name: RUN_BUTTON_NAME });
    expect(runButton).toBeInstanceOf(HTMLButtonElement);
    if (runButton instanceof HTMLButtonElement) {
      expect(runButton.disabled).toBe(true);
    }
    expect(apiMocks.executeWorkbenchQuery).not.toHaveBeenCalled();
  });
});
