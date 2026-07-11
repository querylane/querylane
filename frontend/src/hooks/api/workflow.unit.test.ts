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

  test("collects every workflow page into a single list response", async () => {
    const requests: ListWorkflowsRequest[] = [];
    const transport = createRouterTransport(({ service }) => {
      service(WorkflowService, {
        listWorkflows(request) {
          requests.push(request);
          if (request.pageToken === "") {
            return create(ListWorkflowsResponseSchema, {
              nextPageToken: "page-2",
              workflows: [
                { status: WorkflowStatus.RUNNING, workflowId: "wf-1" },
              ],
            });
          }
          return create(ListWorkflowsResponseSchema, {
            nextPageToken: "",
            workflows: [
              { status: WorkflowStatus.COMPLETED, workflowId: "wf-2" },
            ],
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

    expect(requests).toHaveLength(2);
    expect(requests[0]?.parent).toBe("instances/local/databases/postgres");
    expect(requests[1]?.pageToken).toBe("page-2");
    expect(response.workflows.map((workflow) => workflow.workflowId)).toEqual([
      "wf-1",
      "wf-2",
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
            workflowNodes: [{ nodeId: 1n, nodeType: "SQL" }],
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
