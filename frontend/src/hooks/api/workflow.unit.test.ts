import { create } from "@bufbuild/protobuf";
import { createRouterTransport } from "@connectrpc/connect";
import { InfiniteQueryObserver, QueryObserver } from "@tanstack/react-query";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  listAllWorkflowNodesQueryOptions,
  listWorkflowsInfiniteQueryOptions,
  workflowNodesQueryInput,
  workflowQueryOptions,
  workflowsForDatabaseQueryInput,
} from "@/hooks/api/workflow";
import { QUERY_STALE_TIME } from "@/lib/query-policy";
import {
  type ListWorkflowNodesRequest,
  ListWorkflowNodesResponseSchema,
  ListWorkflowsResponseSchema,
  WorkflowSchema,
  WorkflowService,
  WorkflowStatus,
} from "@/protogen/querylane/console/v1alpha1/workflow_pb";
import { createTestQueryClient } from "@/test/query-client";

afterEach(() => {
  vi.useRealTimers();
});

async function disposeTestQueryClient(
  queryClient: ReturnType<typeof createTestQueryClient>
) {
  queryClient.clear();
  await Promise.resolve();
}

describe("workflow query option helpers", () => {
  test("builds canonical workflow list input for a database", () => {
    expect(
      workflowsForDatabaseQueryInput({
        databaseId: "postgres",
        instanceId: "local",
      })
    ).toEqual({
      pageSize: 50,
      parent: "instances/local/databases/postgres",
    });
  });

  test("builds canonical workflow nodes input for a workflow", () => {
    expect(
      workflowNodesQueryInput({
        databaseId: "postgres",
        instanceId: "local",
        workflowId: "wf-01hq3",
      })
    ).toEqual({
      pageSize: 200,
      parent: "instances/local/databases/postgres/workflows/wf-01hq3",
    });
  });

  test("loads workflow pages only when the next page is requested", async () => {
    const pageTokens: string[] = [];
    const transport = createRouterTransport(({ service }) => {
      service(WorkflowService, {
        listWorkflows(request) {
          pageTokens.push(request.pageToken);
          return create(ListWorkflowsResponseSchema, {
            nextPageToken: request.pageToken ? "" : "page-2",
            workflows: [
              {
                status: WorkflowStatus.COMPLETED,
                workflowId: request.pageToken ? "wf-older" : "wf-newer",
              },
            ],
          });
        },
      });
    });
    const unary = vi.spyOn(transport, "unary");
    const queryClient = createTestQueryClient();
    const observer = new InfiniteQueryObserver(
      queryClient,
      listWorkflowsInfiniteQueryOptions({
        input: workflowsForDatabaseQueryInput({
          databaseId: "postgres",
          instanceId: "local",
        }),
        transport,
      })
    );
    const unsubscribe = observer.subscribe(() => undefined);

    await vi.waitFor(() => expect(pageTokens).toEqual([""]));
    expect(unary.mock.calls[0]?.[1]).toBeInstanceOf(AbortSignal);
    await observer.fetchNextPage();

    expect(pageTokens).toEqual(["", "page-2"]);
    expect(
      observer
        .getCurrentResult()
        .data?.pages.flatMap((page) => page.workflows)
        .map((workflow) => workflow.workflowId)
    ).toEqual(["wf-newer", "wf-older"]);
    expect(observer.getCurrentResult().hasNextPage).toBe(false);

    unsubscribe();
    await disposeTestQueryClient(queryClient);
  });

  test("polls loaded workflow pages while one contains an active workflow", async () => {
    vi.useFakeTimers();
    let requestCount = 0;
    const transport = createRouterTransport(({ service }) => {
      service(WorkflowService, {
        listWorkflows() {
          requestCount += 1;
          return create(ListWorkflowsResponseSchema, {
            workflows: [
              {
                status:
                  requestCount === 1
                    ? WorkflowStatus.RUNNING
                    : WorkflowStatus.CANCELLED,
                workflowId: "wf-1",
              },
            ],
          });
        },
      });
    });
    const queryClient = createTestQueryClient();
    const observer = new InfiniteQueryObserver(
      queryClient,
      listWorkflowsInfiniteQueryOptions({
        input: workflowsForDatabaseQueryInput({
          databaseId: "postgres",
          instanceId: "local",
        }),
        transport,
      })
    );
    const unsubscribe = observer.subscribe(() => undefined);

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(QUERY_STALE_TIME.workflowList);
    expect(requestCount).toBe(2);

    await vi.advanceTimersByTimeAsync(QUERY_STALE_TIME.workflowList * 2);
    expect(requestCount).toBe(2);

    unsubscribe();
    await disposeTestQueryClient(queryClient);
  });

  test("fetches a single workflow by resource name", async () => {
    const names: string[] = [];
    const transport = createRouterTransport(({ service }) => {
      service(WorkflowService, {
        getWorkflow(request) {
          names.push(request.name);
          return create(WorkflowSchema, {
            name: request.name,
            status: WorkflowStatus.FAILED,
            workflowId: "wf-01hq3",
          });
        },
      });
    });
    const queryClient = createTestQueryClient();
    const options = workflowQueryOptions({
      name: "instances/local/databases/postgres/workflows/wf-01hq3",
      transport,
    });

    const workflow = await queryClient.fetchQuery(options);

    expect(names).toEqual([
      "instances/local/databases/postgres/workflows/wf-01hq3",
    ]);
    expect(workflow.workflowId).toBe("wf-01hq3");
    expect(workflow.status).toBe(WorkflowStatus.FAILED);
    expect(options.staleTime).toBe(QUERY_STALE_TIME.workflowList);
    await disposeTestQueryClient(queryClient);
  });

  test("polls a running workflow detail until it becomes terminal", async () => {
    vi.useFakeTimers();
    let requestCount = 0;
    const transport = createRouterTransport(({ service }) => {
      service(WorkflowService, {
        getWorkflow(request) {
          requestCount += 1;
          return create(WorkflowSchema, {
            name: request.name,
            status:
              requestCount === 1
                ? WorkflowStatus.PENDING
                : WorkflowStatus.FAILED,
            workflowId: "wf-01hq3",
          });
        },
      });
    });
    const queryClient = createTestQueryClient();
    const observer = new QueryObserver(
      queryClient,
      workflowQueryOptions({
        name: "instances/local/databases/postgres/workflows/wf-01hq3",
        transport,
      })
    );
    const unsubscribe = observer.subscribe(() => undefined);

    await vi.advanceTimersByTimeAsync(0);
    expect(observer.getCurrentResult().data?.status).toBe(
      WorkflowStatus.PENDING
    );

    await vi.advanceTimersByTimeAsync(QUERY_STALE_TIME.workflowList);
    expect(requestCount).toBe(2);
    expect(observer.getCurrentResult().data?.status).toBe(
      WorkflowStatus.FAILED
    );

    await vi.advanceTimersByTimeAsync(QUERY_STALE_TIME.workflowList * 2);
    expect(requestCount).toBe(2);

    unsubscribe();
    await disposeTestQueryClient(queryClient);
  });

  test("collects every workflow node page into a single list response", async () => {
    const requests: ListWorkflowNodesRequest[] = [];
    const transport = createRouterTransport(({ service }) => {
      service(WorkflowService, {
        listWorkflowNodes(request) {
          requests.push(request);
          return create(ListWorkflowNodesResponseSchema, {
            nextPageToken: "",
            workflowNodes: [{ nodeId: "fd79a31b", nodeType: "SQL" }],
          });
        },
      });
    });
    const queryClient = createTestQueryClient();
    const options = listAllWorkflowNodesQueryOptions({
      input: workflowNodesQueryInput({
        databaseId: "postgres",
        instanceId: "local",
        workflowId: "wf-01hq3",
      }),
      transport,
    });

    const response = await queryClient.fetchQuery(options);

    expect(requests).toHaveLength(1);
    expect(requests[0]?.parent).toBe(
      "instances/local/databases/postgres/workflows/wf-01hq3"
    );
    expect(response.workflowNodes.map((node) => node.nodeType)).toEqual([
      "SQL",
    ]);
    expect(options.staleTime).toBe(QUERY_STALE_TIME.workflowList);
    await disposeTestQueryClient(queryClient);
  });
});
