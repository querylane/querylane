import type { MessageInitShape } from "@bufbuild/protobuf";
import { create } from "@bufbuild/protobuf";
import { createClient, type Transport } from "@connectrpc/connect";
import { useTransport } from "@connectrpc/connect-query";
import {
  type InfiniteData,
  infiniteQueryOptions,
  keepPreviousData,
  queryOptions,
  type UseQueryOptions,
  useInfiniteQuery,
  useQuery,
} from "@tanstack/react-query";
import { buildDatabaseName, buildWorkflowName } from "@/lib/console-resources";
import { paginateAll } from "@/lib/paginate-all";
import { QUERY_STALE_TIME, RESOURCE_QUERY_OPTIONS } from "@/lib/query-policy";
import type {
  ListWorkflowNodesResponse,
  ListWorkflowsResponse,
  Workflow,
} from "@/protogen/querylane/console/v1alpha1/workflow_pb";
import {
  ListWorkflowNodesResponseSchema,
  WorkflowService,
  WorkflowStatus,
} from "@/protogen/querylane/console/v1alpha1/workflow_pb";
import type {
  listWorkflowNodes,
  listWorkflows,
} from "@/protogen/querylane/console/v1alpha1/workflow-WorkflowService_connectquery";

interface ListAllQueryOptions {
  enabled?: boolean;
  refetchInterval?: UseQueryOptions<
    ListWorkflowNodesResponse,
    Error,
    ListWorkflowNodesResponse,
    ReturnType<typeof getListAllWorkflowNodesQueryKey>
  >["refetchInterval"];
}

type ListWorkflowsInput = MessageInitShape<(typeof listWorkflows)["input"]>;
type ListWorkflowNodesInput = MessageInitShape<
  (typeof listWorkflowNodes)["input"]
>;

const WORKFLOW_LIST_PAGE_SIZE = 50;
// A workflow graph has one node per DSL step, so one page normally holds the
// whole graph.
const WORKFLOW_NODE_LIST_PAGE_SIZE = 200;

function isWorkflowActive(status: WorkflowStatus): boolean {
  return status === WorkflowStatus.PENDING || status === WorkflowStatus.RUNNING;
}

function workflowRefetchInterval({
  state,
}: {
  state: { data: Workflow | undefined };
}) {
  return state.data && isWorkflowActive(state.data.status)
    ? QUERY_STALE_TIME.workflowList
    : false;
}

function workflowPagesRefetchInterval({
  state,
}: {
  state: { data: InfiniteData<ListWorkflowsResponse> | undefined };
}) {
  return state.data?.pages.some((page) =>
    page.workflows.some((workflow) => isWorkflowActive(workflow.status))
  )
    ? QUERY_STALE_TIME.workflowList
    : false;
}

function getListWorkflowsPagesQueryKey(input: ListWorkflowsInput) {
  return ["console", "workflows", "list-pages", input] as const;
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

function listWorkflowsInfiniteQueryOptions({
  input,
  transport,
}: {
  input: ListWorkflowsInput;
  transport: Transport;
}) {
  return infiniteQueryOptions<
    ListWorkflowsResponse,
    Error,
    InfiniteData<ListWorkflowsResponse>,
    ReturnType<typeof getListWorkflowsPagesQueryKey>,
    string
  >({
    getNextPageParam: (lastPage) => lastPage.nextPageToken || undefined,
    initialPageParam: "",
    placeholderData: keepPreviousData,
    queryFn: ({ pageParam, signal }) =>
      createClient(WorkflowService, transport).listWorkflows(
        {
          ...input,
          pageToken: pageParam,
        },
        { signal }
      ),
    queryKey: getListWorkflowsPagesQueryKey(input),
    refetchInterval: workflowPagesRefetchInterval,
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
    refetchInterval: workflowRefetchInterval,
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
  filter,
  instanceId,
}: {
  databaseId: string;
  filter?: string | undefined;
  instanceId: string;
}) {
  return {
    ...(filter ? { filter } : {}),
    pageSize: WORKFLOW_LIST_PAGE_SIZE,
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

function useListWorkflowsInfiniteQuery(
  input: ListWorkflowsInput,
  options?: ListAllQueryOptions
) {
  const transport = useTransport();

  return useInfiniteQuery({
    enabled: options?.enabled ?? true,
    ...listWorkflowsInfiniteQueryOptions({ input, transport }),
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
    ...(options?.refetchInterval === undefined
      ? {}
      : { refetchInterval: options.refetchInterval }),
  });
}

export {
  listAllWorkflowNodesQueryOptions,
  listWorkflowsInfiniteQueryOptions,
  useListAllWorkflowNodesQuery,
  useListWorkflowsInfiniteQuery,
  useWorkflowQuery,
  workflowNodesQueryInput,
  workflowQueryOptions,
  workflowsForDatabaseQueryInput,
};
