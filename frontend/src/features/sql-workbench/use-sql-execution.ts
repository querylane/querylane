import { Code, ConnectError, createClient } from "@connectrpc/connect";
import { useEffect, useRef, useState } from "react";
import {
  type ExplainPlan,
  parseExplainPlan,
} from "@/features/sql-workbench/explain-plan-model";
import { buildDatabaseName } from "@/lib/console-resources";
import { longRunningTransport } from "@/lib/transport";
import { normalizeAppUiError } from "@/lib/ui-error";
import type { AppUiError } from "@/lib/ui-error-types";
import {
  type ExecuteQueryResponse,
  ExplainQueryRequest_Format,
  SQLService,
} from "@/protogen/querylane/console/v1alpha1/sql_pb";
import type {
  TableResultColumn,
  TableResultRow,
} from "@/protogen/querylane/console/v1alpha1/table_data_pb";

type ExecutionStatus = "cancelled" | "error" | "idle" | "running" | "success";

interface SqlExecutionStats {
  latencyMs: number;
  rowCount: number;
  truncated: boolean;
}

interface SqlExecution {
  columns: TableResultColumn[];
  error?: AppUiError | undefined;
  finishedAt?: number | undefined;
  notices: string[];
  rowLimit: number;
  rows: TableResultRow[];
  startedAt: number;
  statement: string;
  stats?: SqlExecutionStats | undefined;
  status: ExecutionStatus;
}

interface SqlExplain {
  analyze: boolean;
  error?: AppUiError | undefined;
  latencyMs?: number | undefined;
  notices: string[];
  plan?: ExplainPlan | undefined;
  rawPlan?: string | undefined;
  startedAt: number;
  statement: string;
  status: Exclude<ExecutionStatus, "cancelled">;
}

interface ExecutionSettledEvent {
  durationMs: number;
  errorSummary?: string | undefined;
  rowCount?: number | undefined;
  startedAt: number;
  statement: string;
  status: "cancelled" | "error" | "ok";
}

interface UseSqlExecutionInput {
  databaseId: string;
  instanceId: string;
  onSettled?: ((event: ExecutionSettledEvent) => void) | undefined;
}

type ExecutionPatch = (current: SqlExecution) => SqlExecution;

const EXECUTE_BATCH_SIZE = 500;
const MS_PER_SECOND = 1000;
const NANOS_PER_MS = 1_000_000;
const ERROR_CONTEXT = { area: "sql-workbench", source: "query" } as const;

function isCancellation(error: unknown): boolean {
  return error instanceof ConnectError && error.code === Code.Canceled;
}

function durationToMs(
  duration: { nanos: number; seconds: bigint } | undefined
): number {
  if (!duration) {
    return 0;
  }
  return (
    Number(duration.seconds) * MS_PER_SECOND + duration.nanos / NANOS_PER_MS
  );
}

/** Maps one streamed response onto an execution state update. */
function patchForResponse(
  response: ExecuteQueryResponse
): ExecutionPatch | null {
  const { result } = response;
  switch (result.case) {
    case "columnMetadata": {
      const { columns } = result.value;
      return (current) => ({ ...current, columns });
    }
    case "rowBatch": {
      const { rows } = result.value;
      return (current) => ({ ...current, rows: [...current.rows, ...rows] });
    }
    case "stats": {
      const stats = result.value;
      return (current) => ({
        ...current,
        notices: stats.notices,
        stats: {
          latencyMs: durationToMs(stats.latency),
          rowCount: Number(stats.rowCount),
          truncated: stats.truncated,
        },
      });
    }
    default:
      return null;
  }
}

function initialExecution(
  statement: string,
  rowLimit: number,
  startedAt: number
): SqlExecution {
  return {
    columns: [],
    notices: [],
    rowLimit,
    rows: [],
    startedAt,
    statement,
    status: "running",
  };
}

function useSqlExecution({
  databaseId,
  instanceId,
  onSettled,
}: UseSqlExecutionInput) {
  const [executions, setExecutions] = useState<Record<string, SqlExecution>>(
    {}
  );
  const [explains, setExplains] = useState<Record<string, SqlExplain>>({});
  const controllers = useRef(new Map<string, AbortController>());
  const settledRef = useRef(onSettled);
  const parent = buildDatabaseName(instanceId, databaseId);

  useEffect(function keepSettledHandlerCurrent() {
    settledRef.current = onSettled;
  });

  useEffect(function abortInFlightOnUnmount() {
    const active = controllers.current;
    return () => {
      for (const controller of active.values()) {
        controller.abort();
      }
      active.clear();
    };
  }, []);

  function patchExecution(tabId: string, update: ExecutionPatch) {
    setExecutions((current) => {
      const existing = current[tabId];
      return existing ? { ...current, [tabId]: update(existing) } : current;
    });
  }

  function cancel(tabId: string) {
    controllers.current.get(tabId)?.abort();
  }

  async function consumeStream({
    rowLimit,
    signal,
    statement,
    tabId,
  }: {
    rowLimit: number;
    signal: AbortSignal;
    statement: string;
    tabId: string;
  }): Promise<void> {
    const client = createClient(SQLService, longRunningTransport);
    const stream = client.executeQuery(
      { batchSize: EXECUTE_BATCH_SIZE, parent, rowLimit, statement },
      { signal }
    );
    for await (const response of stream) {
      const patch = patchForResponse(response);
      if (patch) {
        patchExecution(tabId, patch);
      }
    }
  }

  function settle(
    tabId: string,
    context: { startedAt: number; statement: string },
    outcome:
      | { error: AppUiError; status: "error" }
      | { status: "cancelled" }
      | { status: "success" }
  ): ExecutionStatus {
    const finishedAt = Date.now();
    let rowCount: number | undefined;
    patchExecution(tabId, (current) => {
      if (outcome.status === "success") {
        rowCount = current.stats?.rowCount ?? current.rows.length;
      }
      return {
        ...current,
        error: outcome.status === "error" ? outcome.error : undefined,
        finishedAt,
        status: outcome.status,
      };
    });
    settledRef.current?.({
      durationMs: finishedAt - context.startedAt,
      errorSummary:
        outcome.status === "error" ? outcome.error.summary : undefined,
      rowCount,
      startedAt: context.startedAt,
      statement: context.statement,
      status: outcome.status === "success" ? "ok" : outcome.status,
    });
    return outcome.status;
  }

  async function run(
    tabId: string,
    statement: string,
    options: { rowLimit: number }
  ): Promise<ExecutionStatus> {
    cancel(tabId);
    const controller = new AbortController();
    controllers.current.set(tabId, controller);
    const startedAt = Date.now();
    const context = { startedAt, statement };
    setExecutions((current) => ({
      ...current,
      [tabId]: initialExecution(statement, options.rowLimit, startedAt),
    }));
    try {
      await consumeStream({
        rowLimit: options.rowLimit,
        signal: controller.signal,
        statement,
        tabId,
      });
      return settle(tabId, context, { status: "success" });
    } catch (error) {
      if (isCancellation(error) || controller.signal.aborted) {
        return settle(tabId, context, { status: "cancelled" });
      }
      return settle(tabId, context, {
        error: normalizeAppUiError(error, ERROR_CONTEXT),
        status: "error",
      });
    } finally {
      if (controllers.current.get(tabId) === controller) {
        controllers.current.delete(tabId);
      }
    }
  }

  async function explain(
    tabId: string,
    statement: string,
    options: { analyze: boolean }
  ): Promise<void> {
    const startedAt = Date.now();
    const base = {
      analyze: options.analyze,
      notices: [],
      startedAt,
      statement,
    };
    setExplains((current) => ({
      ...current,
      [tabId]: { ...base, status: "running" },
    }));
    const client = createClient(SQLService, longRunningTransport);
    try {
      const response = await client.explainQuery({
        analyze: options.analyze,
        buffers: options.analyze,
        format: ExplainQueryRequest_Format.JSON,
        parent,
        statement,
      });
      setExplains((current) => ({
        ...current,
        [tabId]: {
          ...base,
          latencyMs: durationToMs(response.latency),
          notices: response.notices,
          plan: parseExplainPlan(response.plan) ?? undefined,
          rawPlan: response.plan,
          status: "success",
        },
      }));
    } catch (error) {
      setExplains((current) => ({
        ...current,
        [tabId]: {
          ...base,
          error: normalizeAppUiError(error, {
            ...ERROR_CONTEXT,
            action: "explain",
          }),
          status: "error",
        },
      }));
    }
  }

  function clear(tabId: string) {
    cancel(tabId);
    setExecutions((current) => {
      const { [tabId]: _removed, ...rest } = current;
      return rest;
    });
    setExplains((current) => {
      const { [tabId]: _removed, ...rest } = current;
      return rest;
    });
  }

  return { cancel, clear, executions, explain, explains, run };
}

export type {
  ExecutionSettledEvent,
  ExecutionStatus,
  SqlExecution,
  SqlExecutionStats,
  SqlExplain,
};
export { useSqlExecution };
