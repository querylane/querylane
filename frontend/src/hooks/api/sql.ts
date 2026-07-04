import type { MessageInitShape } from "@bufbuild/protobuf";
import {
  type UseQueryOptions as ConnectUseQueryOptions,
  useQuery as useConnectQuery,
} from "@connectrpc/connect-query";
import { RESOURCE_QUERY_OPTIONS } from "@/lib/query-policy";
import { longRunningTransport } from "@/lib/transport";
import { explainQuery } from "@/protogen/querylane/console/v1alpha1/sql-SQLService_connectquery";

function useExplainQuery(
  input?: MessageInitShape<(typeof explainQuery)["input"]> | undefined,
  options?: ConnectUseQueryOptions<(typeof explainQuery)["output"]>
) {
  const parent = typeof input?.parent === "string" ? input.parent.trim() : "";
  const statement =
    typeof input?.statement === "string" ? input.statement.trim() : "";

  return useConnectQuery(explainQuery, input, {
    ...RESOURCE_QUERY_OPTIONS.explainPlan,
    ...options,
    enabled: (options?.enabled ?? true) && Boolean(parent && statement),
    // EXPLAIN ANALYZE may legitimately run up to the backend's 60s cap.
    transport: longRunningTransport,
  });
}

export { useExplainQuery };
