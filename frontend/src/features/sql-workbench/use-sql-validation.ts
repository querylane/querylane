import { createClient } from "@connectrpc/connect";
import { useTransport } from "@connectrpc/connect-query";
import type { SqlProblem } from "@/features/sql-workbench/sql-diagnostics";
import { buildDatabaseName } from "@/lib/console-resources";
import {
  type QueryDiagnostic,
  SQLService,
} from "@/protogen/querylane/console/v1alpha1/sql_pb";

/**
 * Checks statements against the database the way they will run.
 *
 * `check` resolves to the problem PostgreSQL reported, `null` when the
 * statement is fine, or `undefined` when the check itself failed (transport
 * or server trouble). A failed check paints nothing, and is not remembered
 * as "fine" so the next lint run asks again.
 */
interface SqlValidator {
  check: (
    statement: string,
    signal: AbortSignal
  ) => Promise<SqlProblem | null | undefined>;
  /** What results depend on besides the text: the tab's default schema. */
  scopeKey: string;
}

function toSqlProblem(diagnostic: QueryDiagnostic): SqlProblem {
  return {
    detail: diagnostic.detail,
    hint: diagnostic.hint,
    message: diagnostic.message,
    position: diagnostic.position,
    sqlstate: diagnostic.sqlstate,
  };
}

function useSqlValidator({
  databaseId,
  defaultSchema,
  instanceId,
}: {
  databaseId: string;
  /** Validate the way the statement will run: same search_path. */
  defaultSchema?: string | undefined;
  instanceId: string;
}): SqlValidator {
  const transport = useTransport();
  const parent = buildDatabaseName(instanceId, databaseId);
  return {
    check: (statement, signal) =>
      createClient(SQLService, transport)
        .validateQuery(
          { defaultSchema: defaultSchema ?? "", parent, statement },
          { signal }
        )
        .then(
          ({ diagnostic }) => (diagnostic ? toSqlProblem(diagnostic) : null),
          // The check itself failed: nothing is known about the statement.
          () => undefined
        ),
    scopeKey: defaultSchema ?? "",
  };
}

export type { SqlValidator };
export { useSqlValidator };
