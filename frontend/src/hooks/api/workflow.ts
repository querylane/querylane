import type { MessageInitShape } from "@bufbuild/protobuf";
import { create } from "@bufbuild/protobuf";
import { createClient, type Transport } from "@connectrpc/connect";
import { useTransport } from "@connectrpc/connect-query";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { buildDatabaseName, buildWorkflowName } from "@/lib/console-resources";
import { paginateAll } from "@/lib/paginate-all";
import { RESOURCE_QUERY_OPTIONS } from "@/lib/query-policy";
import {
  ListWorkflowNodesResponseSchema,
  WorkflowService,
} from "@/protogen/querylane/console/v1alpha1/workflow_pb";
import type {
  listWorkflowNodes,
  listWorkflows,
} from "@/protogen/querylane/console/v1alpha1/workflow-WorkflowService_connectquery";

interface ListAllQueryOptions {
  enabled?: boolean;
  refetchOnWindowFocus?: boolean;
}

type ListWorkflowsInput = MessageInitShape<(typeof listWorkflows)["input"]>;
type ListWorkflowNodesInput = MessageInitShape<
  (typeof listWorkflowNodes)["input"]
>;

// pg_durable's df.list_instances is capped at pg_durable.list_instances_max_limit
// (default 1000). We request the whole window in a SINGLE call rather than
// keyset-walking it: the window is "newest first" while the AIP cursor advances
// by hex instance_id, so a multi-request walk over a shifting window can drop
// or repeat instances on a busy database. One call is stable; the list page
// tells the user when the result reaches the cap (older instances may exist).
const WORKFLOW_LIST_WINDOW = 1000;
// A workflow graph has one node per DSL step, so one page normally holds the
// whole graph.
const WORKFLOW_NODE_LIST_PAGE_SIZE = 200;

function getListAllWorkflowsQueryKey(input: ListWorkflowsInput) {
  return ["console", "workflows", "list-all", input] as const;
}

function getWorkflowQueryKey(name: string) {
  return ["console", "workflows", "get", name] as const;
}

function getListAllWorkflowNodesQueryKey(input: ListWorkflowNodesInput) {
  return ["console", "workflow-nodes", "list-all", input] as const;
}

async function fetchAllWorkflowNodes(
  transport: Transport,
  input: ListWorkflowNodesInput
) {
  const client = createClient(WorkflowService, transport);
  const workflowNodes = await paginateAll(
    (pageToken) =>
      client.listWorkflowNodes({ ...input, pageToken: pageToken ?? "" }),
    (response) => response.workflowNodes
  );

  return create(ListWorkflowNodesResponseSchema, {
    nextPageToken: "",
    workflowNodes,
  });
}

function listAllWorkflowsQueryOptions({
  input,
  transport,
}: {
  input: ListWorkflowsInput;
  transport: Transport;
}) {
  return queryOptions({
    // Single call for the whole listing window (see WORKFLOW_LIST_WINDOW). We
    // intentionally do NOT follow next_page_token: keyset-walking a
    // newest-first window that shifts under insert churn is unstable.
    queryFn: () =>
      createClient(WorkflowService, transport).listWorkflows({
        ...input,
        pageToken: "",
      }),
    queryKey: getListAllWorkflowsQueryKey(input),
    ...RESOURCE_QUERY_OPTIONS.workflowList,
  });
}

function workflowQueryOptions({
  name,
  transport,
}: {
  name: string;
  transport: Transport;
}) {
  return queryOptions({
    queryFn: () =>
      createClient(WorkflowService, transport).getWorkflow({ name }),
    queryKey: getWorkflowQueryKey(name),
    ...RESOURCE_QUERY_OPTIONS.workflowList,
  });
}

function listAllWorkflowNodesQueryOptions({
  input,
  transport,
}: {
  input: ListWorkflowNodesInput;
  transport: Transport;
}) {
  return queryOptions({
    queryFn: () => fetchAllWorkflowNodes(transport, input),
    queryKey: getListAllWorkflowNodesQueryKey(input),
    ...RESOURCE_QUERY_OPTIONS.workflowList,
  });
}

function workflowsForDatabaseQueryInput({
  databaseId,
  instanceId,
}: {
  databaseId: string;
  instanceId: string;
}) {
  return {
    pageSize: WORKFLOW_LIST_WINDOW,
    parent: buildDatabaseName(instanceId, databaseId),
  } as const satisfies ListWorkflowsInput;
}

function workflowNodesQueryInput({
  databaseId,
  instanceId,
  workflowId,
}: {
  databaseId: string;
  instanceId: string;
  workflowId: string;
}) {
  return {
    pageSize: WORKFLOW_NODE_LIST_PAGE_SIZE,
    parent: buildWorkflowName(instanceId, databaseId, workflowId),
  } as const satisfies ListWorkflowNodesInput;
}

function useListAllWorkflowsQuery(
  input: ListWorkflowsInput,
  options?: ListAllQueryOptions
) {
  const transport = useTransport();

  return useQuery({
    enabled: options?.enabled ?? true,
    ...listAllWorkflowsQueryOptions({ input, transport }),
    ...(options?.refetchOnWindowFocus === undefined
      ? {}
      : { refetchOnWindowFocus: options.refetchOnWindowFocus }),
  });
}

function useWorkflowQuery(name: string, options?: ListAllQueryOptions) {
  const transport = useTransport();

  return useQuery({
    enabled: options?.enabled ?? true,
    ...workflowQueryOptions({ name, transport }),
  });
}

function useListAllWorkflowNodesQuery(
  input: ListWorkflowNodesInput,
  options?: ListAllQueryOptions
) {
  const transport = useTransport();

  return useQuery({
    enabled: options?.enabled ?? true,
    ...listAllWorkflowNodesQueryOptions({ input, transport }),
  });
}

export {
  listAllWorkflowNodesQueryOptions,
  listAllWorkflowsQueryOptions,
  useListAllWorkflowNodesQuery,
  useListAllWorkflowsQuery,
  useWorkflowQuery,
  WORKFLOW_LIST_WINDOW,
  workflowNodesQueryInput,
  workflowQueryOptions,
  workflowsForDatabaseQueryInput,
};
