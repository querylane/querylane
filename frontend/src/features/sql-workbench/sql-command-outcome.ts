import type { GridEmptyMessage } from "@/components/data-grid/table-data-grid/result-data-grid-types";
import { formatCount } from "@/features/sql-workbench/sql-workbench-format";

/**
 * Copy for a result grid that has columns but no rows. Nothing while rows may
 * still arrive.
 */
function gridEmptyState({
  rowCount,
  status,
}: {
  rowCount: number;
  status: "cancelled" | "error" | "idle" | "running" | "success";
}): GridEmptyMessage | undefined {
  if (rowCount > 0 || status === "running") {
    return;
  }
  if (status === "cancelled") {
    return {
      description: "The statement was cancelled before PostgreSQL sent a row.",
      title: "No rows received",
    };
  }
  return {
    description: "The statement ran and matched nothing.",
    title: "No rows returned",
  };
}

/**
 * Command tags whose only effect is on the session. The workbench runs each
 * statement in a fresh read-only transaction, so these never reach the next
 * statement and a plain "completed" would mislead.
 */
const SESSION_STATE_TAGS = new Set([
  "DEALLOCATE",
  "DEALLOCATE ALL",
  "DECLARE CURSOR",
  "DISCARD ALL",
  "DISCARD PLANS",
  "DISCARD SEQUENCES",
  "DISCARD TEMP",
  "LISTEN",
  "PREPARE",
  "RESET",
  "SET",
  "UNLISTEN",
]);

interface CommandOutcome {
  description: string;
  /** The PostgreSQL command tag, or null when the driver reported none. */
  tag: string | null;
  title: string;
}

/**
 * Describes a statement that completed without a result set: SET, DO, CALL,
 * CREATE TEMP TABLE, and in a future write mode INSERT/UPDATE/DELETE.
 */
function describeCommandOutcome({
  commandTag,
  rowsAffected,
}: {
  commandTag: string | undefined;
  rowsAffected: number | undefined;
}): CommandOutcome {
  const tag = commandTag && commandTag.length > 0 ? commandTag : null;
  const affected = rowsAffected ?? 0;
  if (tag && SESSION_STATE_TAGS.has(tag)) {
    return {
      description:
        "This only changed session state, and it does not carry over: every statement runs in its own read-only transaction. Schema-qualify names (schema.table) instead of setting search_path.",
      tag,
      title: tag,
    };
  }
  if (affected > 0) {
    return {
      description: `${formatCount(affected)} ${affected === 1 ? "row" : "rows"} affected. PostgreSQL returned no result set.`,
      tag,
      title: tag ?? "Statement completed",
    };
  }
  return {
    description: "PostgreSQL ran the statement and returned no result set.",
    tag,
    title: tag ?? "Statement completed",
  };
}

export type { CommandOutcome };
export { describeCommandOutcome, gridEmptyState };
