import { Code, ConnectError, type Transport } from "@connectrpc/connect";
import { afterEach, describe, expect, rs, test } from "@rstest/core";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useSqlExecution } from "@/features/sql-workbench/use-sql-execution";
import * as actualTransport from "@/lib/transport" with {
  rstest: "importActual",
};
import { SQLService } from "@/protogen/querylane/console/v1alpha1/sql_pb";
import { createTestRouterTransport } from "@/test/router-transport";

const sqlTransport = rs.hoisted(() => ({
  current: undefined as Transport | undefined,
}));

function requireSqlTransport() {
  if (!sqlTransport.current) {
    throw new Error("Set sqlTransport.current before running a statement.");
  }
  return sqlTransport.current;
}

// useSqlExecution pins longRunningTransport instead of reading the provider
// transport, so route that one transport to the fixture service.
rs.mock("@/lib/transport", () => {
  const longRunningTransport: Transport = {
    stream: (...args) => requireSqlTransport().stream(...args),
    unary: (...args) => requireSqlTransport().unary(...args),
  };
  return { ...actualTransport, longRunningTransport };
});

const TAB_ID = "tab-1";
const ROW = { values: [] };

function renderExecution() {
  const onSettled = rs.fn();
  const { result } = renderHook(() =>
    useSqlExecution({ databaseId: "app", instanceId: "local", onSettled })
  );
  return { onSettled, result };
}

afterEach(() => {
  cleanup();
  sqlTransport.current = undefined;
});

describe("useSqlExecution", () => {
  test("reports the server's row count when the stream settles", async () => {
    sqlTransport.current = createTestRouterTransport((router) => {
      router.service(SQLService, {
        async *executeQuery() {
          yield* [
            { result: { case: "rowBatch", value: { rows: [ROW, ROW] } } },
            {
              result: {
                case: "stats",
                value: { commandTag: "SELECT 2", rowCount: 2n },
              },
            },
          ] as const;
        },
      });
    });
    const { onSettled, result } = renderExecution();

    let status: string | undefined;
    await act(async () => {
      status = await result.current.run(TAB_ID, "select 1", { rowLimit: 100 });
    });

    expect(status).toBe("success");
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(onSettled.mock.calls[0]?.[0]).toMatchObject({
      rowCount: 2,
      statement: "select 1",
      status: "ok",
    });
    expect(result.current.executions[TAB_ID]).toMatchObject({
      rowLimit: 100,
      status: "success",
    });
    expect(result.current.executions[TAB_ID]?.rows).toHaveLength(2);
  });

  test("counts streamed rows when the stream ends without stats", async () => {
    sqlTransport.current = createTestRouterTransport((router) => {
      router.service(SQLService, {
        async *executeQuery() {
          yield* [
            { result: { case: "rowBatch", value: { rows: [ROW, ROW, ROW] } } },
          ] as const;
        },
      });
    });
    const { onSettled, result } = renderExecution();

    await act(async () => {
      await result.current.run(TAB_ID, "select 1", { rowLimit: 100 });
    });

    expect(onSettled.mock.calls[0]?.[0]).toMatchObject({ rowCount: 3 });
  });

  test("settles a failed statement as an error without a row count", async () => {
    sqlTransport.current = createTestRouterTransport((router) => {
      router.service(SQLService, {
        // Fails before the first message, like a statement that does not parse.
        async *executeQuery() {
          yield* [];
          throw new ConnectError(
            'relation "nope" does not exist',
            Code.InvalidArgument
          );
        },
      });
    });
    const { onSettled, result } = renderExecution();

    let status: string | undefined;
    await act(async () => {
      status = await result.current.run(TAB_ID, "select * from nope", {
        rowLimit: 100,
      });
    });

    expect(status).toBe("error");
    expect(onSettled.mock.calls[0]?.[0]).toMatchObject({
      rowCount: undefined,
      status: "error",
    });
    expect(result.current.executions[TAB_ID]?.status).toBe("error");
    expect(result.current.executions[TAB_ID]?.error).toBeDefined();
  });
});
