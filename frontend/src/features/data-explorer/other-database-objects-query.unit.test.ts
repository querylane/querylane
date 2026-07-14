import { create } from "@bufbuild/protobuf";
import { describe, expect, it, vi } from "vitest";
import {
  fetchOtherDatabaseObjects,
  queryRowToObject,
  rowToRecord,
  tableValueToText,
} from "@/features/data-explorer/other-database-objects-query";
import {
  TableCellSchema,
  TableResultRowSchema,
  TableValueSchema,
} from "@/protogen/querylane/console/v1alpha1/table_data_pb";

const TEST_NUMBER_42 = 42;
const TEST_NUMBER_3 = 3;
const TEST_NUMBER_1000 = 1000;

function stringValue(value: string) {
  return create(TableValueSchema, {
    kind: { case: "stringValue", value },
  });
}

const typeRow = {
  badge: "ENUM",
  category: "types",
  definition:
    "CREATE TYPE shipping.route AS ENUM ('direct', 'port, transfer');",
  detail: "",
  extra: "",
  name: "shipping.route",
  sort_key: "shipping.route",
  status: "",
  summary: "direct, port, transfer",
  values: '["direct","port, transfer"]',
};

describe("other database objects query", () => {
  it("converts streamed table values and rows", () => {
    expect(tableValueToText(stringValue("route"))).toBe("route");
    expect(
      tableValueToText(
        create(TableValueSchema, {
          kind: { case: "int64Value", value: BigInt(TEST_NUMBER_42) },
        })
      )
    ).toBe("42");
    expect(
      tableValueToText(
        create(TableValueSchema, {
          kind: { case: "boolValue", value: true },
        })
      )
    ).toBe("true");
    expect(tableValueToText(create(TableValueSchema))).toBe("");

    const row = create(TableResultRowSchema, {
      values: [
        create(TableCellSchema, { value: stringValue("types") }),
        create(TableCellSchema, { value: stringValue("shipping.route") }),
      ],
    });
    expect(rowToRecord(["category", "name"], row)).toEqual({
      category: "types",
      name: "shipping.route",
    });
  });

  it("parses enum values without splitting labels that contain commas", () => {
    expect(queryRowToObject(typeRow)).toMatchObject({
      category: "types",
      status: undefined,
      values: ["direct", "port, transfer"],
    });
    expect(queryRowToObject({ category: "unknown" })).toBeNull();
    expect(
      queryRowToObject({ ...typeRow, status: "future-status" })?.status
    ).toBe("warning");
    expect(() => queryRowToObject({ ...typeRow, values: "[42]" })).toThrow(
      "Invalid database object values"
    );
  });

  it("skips the pg_cron query when the extension table is absent", async () => {
    const execute = vi.fn(
      ({ statement }: { parent: string; statement: string }) => {
        const rows: Record<string, string>[] = statement.includes(
          "WITH visible_namespaces"
        )
          ? [typeRow]
          : [{ has_cron_job_table: "false" }];
        return Promise.resolve(rows);
      }
    );

    const result = await fetchOtherDatabaseObjects({
      execute,
      parent: "instances/i/databases/d",
    });

    expect(result.objects).toHaveLength(1);
    expect(result.isTruncated).toBe(false);
    expect(execute).toHaveBeenCalledTimes(2);
    const mainStatement = execute.mock.calls[0]?.[0].statement;
    expect(mainStatement).toContain("pg_sequence_last_value");
    expect(mainStatement).toContain("to_jsonb(c)->>'colllocale'");
    expect(mainStatement).toContain("'%I %L'");
    expect(mainStatement).toContain("nspname !~ '^pg_temp_'");
    expect(mainStatement).toContain("FOR TABLE");
    expect(execute.mock.calls[1]?.[0].statement).toContain(
      "has_table_privilege"
    );
  });

  it("loads pg_cron jobs only when the extension table exists", async () => {
    const cronRow = {
      badge: "pg_cron",
      category: "cronJobs",
      definition:
        "SELECT cron.schedule('refresh', '0 3 * * *', 'CALL refresh()');",
      detail: "CALL refresh()",
      extra: "active",
      name: "refresh",
      sort_key: "refresh",
      status: "ok",
      summary: "0 3 * * * · postgres · app",
      values: "[]",
    };
    const execute = vi.fn(
      ({ statement }: { parent: string; statement: string }) => {
        let rows: Record<string, string>[];
        if (statement.includes("WITH visible_namespaces")) {
          rows = [typeRow];
        } else if (statement.includes("to_regclass")) {
          rows = [{ has_cron_job_table: "true" }];
        } else {
          rows = [cronRow];
        }
        return Promise.resolve(rows);
      }
    );

    const result = await fetchOtherDatabaseObjects({
      execute,
      parent: "instances/i/databases/d",
    });

    expect(result.objects.map((object) => object.category)).toEqual([
      "types",
      "cronJobs",
    ]);
    expect(execute).toHaveBeenCalledTimes(TEST_NUMBER_3);
  });

  it("keeps introspection queries within a single live-query slot", async () => {
    let resolveMainQuery:
      | ((rows: Record<string, string>[]) => void)
      | undefined;
    const mainRows = new Promise<Record<string, string>[]>((resolve) => {
      resolveMainQuery = resolve;
    });
    const execute = vi.fn(
      ({ statement }: { parent: string; statement: string }) =>
        statement.includes("WITH visible_namespaces")
          ? mainRows
          : Promise.resolve([{ has_cron_job_table: "false" }])
    );

    const resultPromise = fetchOtherDatabaseObjects({
      execute,
      parent: "instances/i/databases/d",
    });
    await Promise.resolve();
    const callsBeforeMainQueryFinished = execute.mock.calls.length;

    resolveMainQuery?.([typeRow]);
    await resultPromise;

    expect(callsBeforeMainQueryFinished).toBe(1);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("reports and trims inventories over the display limit", async () => {
    const execute = vi.fn(
      ({ statement }: { parent: string; statement: string }) => {
        const rows: Record<string, string>[] = statement.includes(
          "WITH visible_namespaces"
        )
          ? Array.from({ length: 1001 }, (_, index) => ({
              ...typeRow,
              name: `shipping.route_${index}`,
              sort_key: `shipping.route_${index}`,
            }))
          : [{ has_cron_job_table: "false" }];
        return Promise.resolve(rows);
      }
    );

    const result = await fetchOtherDatabaseObjects({
      execute,
      parent: "instances/i/databases/d",
    });

    expect(result.isTruncated).toBe(true);
    expect(result.objects).toHaveLength(TEST_NUMBER_1000);
  });
});
