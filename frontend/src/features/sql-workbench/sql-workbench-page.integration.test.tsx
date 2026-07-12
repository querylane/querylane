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
    expect(screen.queryByText(COMPOSITE_INDEX_INSIGHT_RE)).toBeNull();
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
