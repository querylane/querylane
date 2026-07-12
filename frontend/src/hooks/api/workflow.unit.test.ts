import { create } from "@bufbuild/protobuf";
import { createRouterTransport } from "@connectrpc/connect";
import { describe, expect, test } from "vitest";
import {
  listAllWorkflowNodesQueryOptions,
  listAllWorkflowsQueryOptions,
  workflowNodesQueryInput,
  workflowQueryOptions,
  workflowsForDatabaseQueryInput,
} from "@/hooks/api/workflow";
import { QUERY_STALE_TIME } from "@/lib/query-policy";
import {
  type ListWorkflowNodesRequest,
  ListWorkflowNodesResponseSchema,
  type ListWorkflowsRequest,
  ListWorkflowsResponseSchema,
  WorkflowSchema,
  WorkflowService,
  WorkflowStatus,
} from "@/protogen/querylane/console/v1alpha1/workflow_pb";
import { createTestQueryClient } from "@/test/query-client";

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
      // The whole listing window in one call (see WORKFLOW_LIST_WINDOW).
      pageSize: 1000,
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

  test("fetches the listing window in a single call and ignores extra pages", async () => {
    const requests: ListWorkflowsRequest[] = [];
    const transport = createRouterTransport(({ service }) => {
      service(WorkflowService, {
        listWorkflows(request) {
          requests.push(request);
          // A non-empty next token must NOT trigger a follow-up request: the
          // window is fetched in one shot to avoid an unstable keyset walk.
          return create(ListWorkflowsResponseSchema, {
            nextPageToken: "page-2",
            workflows: [{ status: WorkflowStatus.RUNNING, workflowId: "wf-1" }],
          });
        },
      });
    });
    const queryClient = createTestQueryClient();
    const options = listAllWorkflowsQueryOptions({
      input: workflowsForDatabaseQueryInput({
        databaseId: "postgres",
        instanceId: "local",
      }),
      transport,
    });

    const response = await queryClient.fetchQuery(options);

    expect(requests).toHaveLength(1);
    expect(requests[0]?.parent).toBe("instances/local/databases/postgres");
    expect(requests[0]?.pageSize).toBe(1000);
    expect(response.workflows.map((workflow) => workflow.workflowId)).toEqual([
      "wf-1",
    ]);
    expect(options.staleTime).toBe(QUERY_STALE_TIME.workflowList);
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
