import { createClient } from "@connectrpc/connect";
import { useTransport } from "@connectrpc/connect-query";
import type { SqlProblem } from "@/features/sql-workbench/sql-diagnostics";
import { buildDatabaseName } from "@/lib/console-resources";
import { SQLService } from "@/protogen/querylane/console/v1alpha1/sql_pb";

/**
 * Checks one statement against the database. Resolves to the problem
 * PostgreSQL reported, or null when the statement is fine. Transport and
 * server failures also resolve to null: a check that could not run must not
 * paint an error under correct SQL.
 */
type SqlValidator = (
  statement: string,
  signal: AbortSignal
) => Promise<SqlProblem | null>;

function useSqlValidator({
  databaseId,
  instanceId,
}: {
  databaseId: string;
  instanceId: string;
}): SqlValidator {
  const transport = useTransport();
  const parent = buildDatabaseName(instanceId, databaseId);
  return async (statement, signal) => {
    const client = createClient(SQLService, transport);
    try {
      const response = await client.validateQuery(
        { parent, statement },
        { signal }
      );
      const { diagnostic } = response;
      if (!diagnostic) {
        return null;
      }
      return {
        detail: diagnostic.detail,
        hint: diagnostic.hint,
        message: diagnostic.message,
        position: diagnostic.position,
        sqlstate: diagnostic.sqlstate,
      };
    } catch {
      return null;
    }
  };
}

export type { SqlValidator };
export { useSqlValidator };
