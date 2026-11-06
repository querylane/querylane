import { create } from "@bufbuild/protobuf";
import { Code, ConnectError, type Transport } from "@connectrpc/connect";
import { afterEach, describe, expect, rs, test } from "@rstest/core";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useSqlExecution } from "@/features/sql-workbench/use-sql-execution";
import * as actualTransport from "@/lib/transport" with {
  rstest: "importActual",
};
import {
  ExecuteQueryResponseSchema,
  SQLService,
} from "@/protogen/querylane/console/v1alpha1/sql_pb";
import { rejectedStream, streamOf } from "@/test/async-stream";
import { createTestRouterTransport } from "@/test/router-transport";

const sqlTransport = rs.hoisted((): { current: Transport | undefined } => ({
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
  const { result, unmount } = renderHook(() =>
    useSqlExecution({ databaseId: "app", instanceId: "local", onSettled })
  );
  return { onSettled, result, unmount };
}

function heldExplain() {
  return {
    response: Promise.withResolvers<{ plan: string }>(),
    started: Promise.withResolvers<AbortSignal>(),
  };
}

function installExplains(
  requests: Record<string, ReturnType<typeof heldExplain>>
) {
  sqlTransport.current = createTestRouterTransport((router) => {
    router.service(SQLService, {
      explainQuery(request, context) {
        const pending = requests[request.statement];
        if (!pending) {
          throw new Error(`Unexpected Explain: ${request.statement}`);
        }
        pending.started.resolve(context.signal);
        return pending.response.promise;
      },
    });
  });
}

function settleExplain(
  pending: ReturnType<typeof heldExplain>,
  outcome: "cancelled" | "error" | "success"
) {
  if (outcome === "success") {
    pending.response.resolve({ plan: "old plan" });
  } else {
    pending.response.reject(
      new ConnectError(
        "old request settled",
        outcome === "cancelled" ? Code.Canceled : Code.Internal
      )
    );
  }
}

afterEach(() => {
  cleanup();
  sqlTransport.current = undefined;
});

describe("useSqlExecution", () => {
  test("reports the server's row count when the stream settles", async () => {
    sqlTransport.current = createTestRouterTransport((router) => {
      router.service(SQLService, {
        executeQuery() {
          return streamOf(
            create(ExecuteQueryResponseSchema, {
              result: { case: "rowBatch", value: { rows: [ROW, ROW] } },
            }),
            create(ExecuteQueryResponseSchema, {
              result: {
                case: "stats",
                value: { commandTag: "SELECT 2", rowCount: 2n },
              },
            })
          );
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
        executeQuery() {
          return streamOf(
            create(ExecuteQueryResponseSchema, {
              result: { case: "rowBatch", value: { rows: [ROW, ROW, ROW] } },
            })
          );
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
        executeQuery() {
          return rejectedStream(
            new ConnectError(
              'relation "nope" does not exist',
              Code.InvalidArgument
            )
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

  test.each(["cancelled", "error", "success"] as const)(
    "keeps replacement Explain running and cancellable after late %s",
    async (outcome) => {
      const first = heldExplain();
      const second = heldExplain();
      installExplains({ "select 1": first, "select 2": second });
      const { result } = renderExecution();
      let a: Promise<void> | undefined;
      let b: Promise<void> | undefined;
      await act(async () => {
        a = result.current.explain(TAB_ID, "select 1", { analyze: true });
        await first.started.promise;
      });
      await act(async () => {
        b = result.current.explain(TAB_ID, "select 2", { analyze: false });
        await second.started.promise;
      });
      const firstSignal = await first.started.promise;
      expect(firstSignal.aborted).toBe(true);
      await act(async () => {
        settleExplain(first, outcome);
        await a;
      });
      expect(result.current.explains[TAB_ID]).toMatchObject({
        analyze: false,
        statement: "select 2",
        status: "running",
      });
      const signal = await second.started.promise;
      expect(signal.aborted).toBe(false);
      await act(async () => {
        result.current.cancelExplain(TAB_ID);
        expect(signal.aborted).toBe(true);
        second.response.reject(new ConnectError("cancelled B", Code.Canceled));
        await b;
      });
      expect(result.current.explains[TAB_ID]).toMatchObject({
        statement: "select 2",
        status: "cancelled",
      });
    }
  );

  test.each(["cancelled", "error", "success"] as const)(
    "does not resurrect a cleared Explain after late %s",
    async (outcome) => {
      const pending = heldExplain();
      installExplains({ "select 1": pending });
      const { result } = renderExecution();
      let request: Promise<void> | undefined;
      await act(async () => {
        request = result.current.explain(TAB_ID, "select 1", {
          analyze: false,
        });
        await pending.started.promise;
      });
      act(() => {
        result.current.clear(TAB_ID);
      });
      const signal = await pending.started.promise;
      expect(signal.aborted).toBe(true);
      expect(result.current.explains[TAB_ID]).toBeUndefined();
      await act(async () => {
        settleExplain(pending, outcome);
        await request;
      });
      expect(result.current.explains[TAB_ID]).toBeUndefined();
    }
  );

  test.each(["cancelled", "error", "success"] as const)(
    "preserves completed replacement Explain after late %s",
    async (outcome) => {
      const first = heldExplain();
      const second = heldExplain();
      installExplains({ "select 1": first, "select 2": second });
      const { result } = renderExecution();
      let a: Promise<void> | undefined;
      await act(async () => {
        a = result.current.explain(TAB_ID, "select 1", { analyze: true });
        await first.started.promise;
      });
      // Keep start, response, controller cleanup and React's queued updates
      // inside one act: valid success must survive controller-map deletion.
      await act(async () => {
        const b = result.current.explain(TAB_ID, "select 2", {
          analyze: false,
        });
        await second.started.promise;
        second.response.resolve({ plan: "replacement plan" });
        await b;
      });
      expect(result.current.explains[TAB_ID]).toMatchObject({
        rawPlan: "replacement plan",
        statement: "select 2",
        status: "success",
      });
      await act(async () => {
        settleExplain(first, outcome);
        await a;
      });
      expect(result.current.explains[TAB_ID]).toMatchObject({
        rawPlan: "replacement plan",
        statement: "select 2",
        status: "success",
      });
    }
  );

  test("keeps Explain cancellation independent between tabs", async () => {
    const first = heldExplain();
    const second = heldExplain();
    installExplains({ "select 1": first, "select 2": second });
    const { result } = renderExecution();
    let a: Promise<void> | undefined;
    let b: Promise<void> | undefined;
    await act(async () => {
      a = result.current.explain(TAB_ID, "select 1", { analyze: false });
      b = result.current.explain("tab-2", "select 2", { analyze: false });
      await Promise.all([first.started.promise, second.started.promise]);
    });
    const [firstSignal, secondSignal] = await Promise.all([
      first.started.promise,
      second.started.promise,
    ]);
    act(() => {
      result.current.cancelExplain(TAB_ID);
    });
    expect(firstSignal.aborted).toBe(true);
    expect(secondSignal.aborted).toBe(false);
    await act(async () => {
      settleExplain(first, "cancelled");
      second.response.resolve({ plan: "other tab plan" });
      await Promise.all([a, b]);
    });
    expect(result.current.explains[TAB_ID]?.status).toBe("cancelled");
    expect(result.current.explains["tab-2"]).toMatchObject({
      rawPlan: "other tab plan",
      statement: "select 2",
      status: "success",
    });
  });

  test("retains a current Explain error", async () => {
    const pending = heldExplain();
    installExplains({ "select 1": pending });
    const { result } = renderExecution();
    await act(async () => {
      const request = result.current.explain(TAB_ID, "select 1", {
        analyze: false,
      });
      await pending.started.promise;
      settleExplain(pending, "error");
      await request;
    });
    expect(result.current.explains[TAB_ID]?.status).toBe("error");
    expect(result.current.explains[TAB_ID]?.error).toBeDefined();
  });

  test("aborts pending Explain on unmount", async () => {
    const pending = heldExplain();
    installExplains({ "select 1": pending });
    const { result, unmount } = renderExecution();
    let request: Promise<void> | undefined;
    await act(async () => {
      request = result.current.explain(TAB_ID, "select 1", { analyze: false });
      await pending.started.promise;
    });
    const signal = await pending.started.promise;
    unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => {
      settleExplain(pending, "success");
      await request;
    });
  });
});
