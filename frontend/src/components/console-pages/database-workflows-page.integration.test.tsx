import { create } from "@bufbuild/protobuf";
import {
  Code,
  ConnectError,
  createRouterTransport,
  type Transport,
} from "@connectrpc/connect";
import { TransportProvider } from "@connectrpc/connect-query";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { BackendDatabaseWorkflowsPage } from "@/components/console-pages/database-workflows-page";
import { WorkflowDetailPage } from "@/components/console-pages/workflow-detail-page";
import {
  ListWorkflowNodesResponseSchema,
  ListWorkflowsResponseSchema,
  WorkflowSchema,
  WorkflowService,
  WorkflowStatus,
} from "@/protogen/querylane/console/v1alpha1/workflow_pb";
import { createTestQueryClient } from "@/test/query-client";

afterEach(() => cleanup());

function WorkflowsListHarness() {
  return (
    <BackendDatabaseWorkflowsPage databaseId="postgres" instanceId="local" />
  );
}

function WorkflowDetailHarness() {
  return (
    <WorkflowDetailPage
      databaseId="postgres"
      instanceId="local"
      workflowId="wf-01hq3"
    />
  );
}

function renderWithRouter(transport: Transport, initialEntry: string) {
  const rootRoute = createRootRoute();
  const instanceRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "instances/$instanceId",
    validateSearch: (search: Record<string, unknown>) => ({
      q: typeof search["q"] === "string" ? search["q"] : undefined,
    }),
  });
  const databaseRoute = createRoute({
    getParentRoute: () => instanceRoute,
    path: "databases/$databaseId",
  });
  const extensionsRoute = createRoute({
    component: () => null,
    getParentRoute: () => databaseRoute,
    path: "extensions",
  });
  const workflowsRoute = createRoute({
    getParentRoute: () => databaseRoute,
    path: "workflows",
  });
  const workflowsIndexRoute = createRoute({
    component: WorkflowsListHarness,
    getParentRoute: () => workflowsRoute,
    path: "/",
  });
  const workflowDetailRoute = createRoute({
    component: WorkflowDetailHarness,
    getParentRoute: () => workflowsRoute,
    path: "$workflowId",
  });
  const router = createRouter({
    defaultPreloadStaleTime: 0,
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
    routeTree: rootRoute.addChildren([
      instanceRoute.addChildren([
        databaseRoute.addChildren([
          extensionsRoute,
          workflowsRoute.addChildren([
            workflowsIndexRoute,
            workflowDetailRoute,
          ]),
        ]),
      ]),
    ]),
  });
  const queryClient = createTestQueryClient();

  render(
    <TransportProvider transport={transport}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </TransportProvider>
  );
}

const LIST_ENTRY = "/instances/local/databases/postgres/workflows";
const DETAIL_ENTRY = "/instances/local/databases/postgres/workflows/wf-01hq3";

describe("database workflows page", () => {
  test("renders workflow rows with status badges", async () => {
    const transport = createRouterTransport(({ service }) => {
      service(WorkflowService, {
        listWorkflows() {
          return create(ListWorkflowsResponseSchema, {
            workflows: [
              {
                executionCount: 3n,
                functionName: "adhoc",
                label: "embed-docs",
                name: "instances/local/databases/postgres/workflows/wf-01hq3",
                status: WorkflowStatus.RUNNING,
                workflowId: "wf-01hq3",
              },
              {
                name: "instances/local/databases/postgres/workflows/wf-01hq4",
                status: WorkflowStatus.FAILED,
                workflowId: "wf-01hq4",
              },
            ],
          });
        },
      });
    });

    renderWithRouter(transport, LIST_ENTRY);

    expect(await screen.findByRole("link", { name: "wf-01hq3" })).toBeTruthy();
    expect(screen.getByText("Running")).toBeTruthy();
    expect(screen.getByText("Failed")).toBeTruthy();
    expect(screen.getByText("embed-docs")).toBeTruthy();
  });

  test("shows the not-installed state on FailedPrecondition", async () => {
    const transport = createRouterTransport(({ service }) => {
      service(WorkflowService, {
        listWorkflows() {
          throw new ConnectError(
            "pg_durable extension is not installed in this database",
            Code.FailedPrecondition
          );
        },
      });
    });

    renderWithRouter(transport, LIST_ENTRY);

    expect(await screen.findByText("pg_durable is not installed")).toBeTruthy();
    expect(screen.getByRole("link", { name: "View extensions" })).toBeTruthy();
  });

  test("shows the empty state when no workflows are visible", async () => {
    const transport = createRouterTransport(({ service }) => {
      service(WorkflowService, {
        listWorkflows() {
          return create(ListWorkflowsResponseSchema, { workflows: [] });
        },
      });
    });

    renderWithRouter(transport, LIST_ENTRY);

    expect(await screen.findByText("No workflows found")).toBeTruthy();
  });
});

describe("workflow detail page", () => {
  test("renders workflow metadata, steps, and output", async () => {
    const transport = createRouterTransport(({ service }) => {
      service(WorkflowService, {
        getWorkflow(request) {
          return create(WorkflowSchema, {
            executionCount: 2n,
            functionName: "adhoc",
            functionVersion: "v3",
            label: "embed-docs",
            name: request.name,
            output: '{"rows": 12}',
            status: WorkflowStatus.COMPLETED,
            workflowId: "wf-01hq3",
          });
        },
        listWorkflowNodes() {
          return create(ListWorkflowNodesResponseSchema, {
            workflowNodes: [
              {
                executionId: 1n,
                nodeId: "fd79a31b",
                nodeType: "SQL",
                query: "SELECT id FROM documents",
                resultName: "batch",
                status: "completed",
              },
            ],
          });
        },
      });
    });

    renderWithRouter(transport, DETAIL_ENTRY);

    expect(
      await screen.findByRole("heading", { name: "wf-01hq3" })
    ).toBeTruthy();
    expect(screen.getByText("Completed")).toBeTruthy();
    expect(screen.getByText("SELECT id FROM documents")).toBeTruthy();
    expect(screen.getByText('{"rows": 12}')).toBeTruthy();
    expect(screen.getByRole("link", { name: "All workflows" })).toBeTruthy();
  });

  test("shows the not-found state for a missing workflow", async () => {
    const transport = createRouterTransport(({ service }) => {
      service(WorkflowService, {
        getWorkflow() {
          throw new ConnectError("workflow not found", Code.NotFound);
        },
        listWorkflowNodes() {
          throw new ConnectError("workflow not found", Code.NotFound);
        },
      });
    });

    renderWithRouter(transport, DETAIL_ENTRY);

    expect(await screen.findByText("Workflow not found")).toBeTruthy();
  });
});
