import { create } from "@bufbuild/protobuf";
import { durationFromMs } from "@bufbuild/protobuf/wkt";
import { describe, expect, test } from "vitest";
import {
  type ExecuteQueryResponse,
  ExecuteQueryResponseSchema,
} from "@/protogen/querylane/console/v1alpha1/sql_pb";
import { DataType } from "@/protogen/querylane/console/v1alpha1/table_pb";
import {
  buildWorkbenchParent,
  collectExecuteQueryStream,
  formatDurationMs,
  isReadOnlyStatementCandidate,
  parseExplainTextPlan,
} from "./sql-workbench-model";

const EXPLAIN_PLAN = `Limit  (cost=112.41..112.53 rows=50 width=64) (actual time=27.78..27.80 rows=50 loops=1)
  Buffers: shared hit=1852 read=126
  ->  Sort  (cost=112.41..115.36 rows=1180 width=64) (actual time=27.77..27.78 rows=50 loops=1)
        Sort Key: s.eta
        ->  Index Scan using shipments_status_idx on shipping.shipments s  (cost=0.43..88.20 rows=1180 width=52) (actual time=0.71..25.51 rows=1204 loops=1)
Planning Time: 0.42 ms
Execution Time: 27.80 ms`;

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

describe("sql workbench model", () => {
  test("builds database parent resource names", () => {
    expect(
      buildWorkbenchParent({
        databaseId: "logistics",
        instanceId: "prod-core-eu",
      })
    ).toBe("instances/prod-core-eu/databases/logistics");
  });

  test("accepts only read-only statement candidates in the client hint", () => {
    expect(
      isReadOnlyStatementCandidate("SELECT * FROM shipping.shipments")
    ).toBe(true);
    expect(
      isReadOnlyStatementCandidate(
        "WITH recent AS (SELECT 1) SELECT * FROM recent"
      )
    ).toBe(true);
    expect(isReadOnlyStatementCandidate("/* dashboard */ SELECT 1")).toBe(true);
    expect(
      isReadOnlyStatementCandidate("-- inspect setting\nSHOW search_path")
    ).toBe(true);
    expect(
      isReadOnlyStatementCandidate("UPDATE shipping.shipments SET status = 'x'")
    ).toBe(false);
    expect(
      isReadOnlyStatementCandidate(
        "SELECT * INTO scratch_shipments FROM shipping.shipments"
      )
    ).toBe(false);
    expect(
      isReadOnlyStatementCandidate("SELECT * FROM shipping.shipments FOR SHARE")
    ).toBe(false);
    expect(isReadOnlyStatementCandidate("SELECT 1; SELECT 2")).toBe(false);
  });

  test("collects streamed SQL responses into table state", async () => {
    const result = await collectExecuteQueryStream(
      streamResponses([
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
                {
                  columnName: "eta",
                  dataType: DataType.DATE,
                  isNullable: false,
                  mayTruncate: false,
                  rawType: "DATE",
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
                        kind: { case: "stringValue", value: "ML-1" },
                      },
                    },
                    {
                      fullSizeBytes: 0n,
                      fullValueToken: "",
                      truncated: false,
                      value: {
                        kind: { case: "stringValue", value: "2026-07-06" },
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
              latency: durationFromMs(27.8),
              notices: ["using index shipments_status_idx"],
              rowCount: 1n,
              truncated: false,
            },
          },
        }),
      ])
    );

    expect(result.columns.map((column) => column.columnName)).toEqual([
      "ref",
      "eta",
    ]);
    expect(result.rows).toHaveLength(1);
    expect(result.stats?.rowCount).toBe(1n);
    expect(result.notices).toEqual(["using index shipments_status_idx"]);
  });

  test("formats protobuf durations as milliseconds", () => {
    expect(formatDurationMs(durationFromMs(27.8))).toBe("27.8 ms");
    expect(formatDurationMs(durationFromMs(1250))).toBe("1,250 ms");
  });

  test("parses live text plans into truthful metrics and nodes", () => {
    expect(parseExplainTextPlan(EXPLAIN_PLAN)).toEqual({
      executionTimeMs: 27.8,
      nodes: [
        {
          actualRows: 50,
          actualTimeMs: 27.8,
          depth: 0,
          estimatedRows: 50,
          exclusiveTimeMs: 0.02,
          id: 1,
          label: "Limit",
          loops: 1,
        },
        {
          actualRows: 50,
          actualTimeMs: 27.78,
          depth: 1,
          estimatedRows: 1180,
          exclusiveTimeMs: 2.27,
          id: 2,
          label: "Sort",
          loops: 1,
        },
        {
          actualRows: 1204,
          actualTimeMs: 25.51,
          depth: 4,
          estimatedRows: 1180,
          exclusiveTimeMs: 25.51,
          id: 3,
          label:
            "Index Scan using shipments_status_idx on shipping.shipments s",
          loops: 1,
        },
      ],
      planningTimeMs: 0.42,
      sharedHitBlocks: 1852,
      sharedReadBlocks: 126,
    });
  });
});
