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
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { BackendDatabaseWorkflowsPage } from "@/components/console-pages/database-workflows-page";
import { WorkflowDetailPage } from "@/components/console-pages/workflow-detail-page";
import { QUERY_STALE_TIME } from "@/lib/query-policy";
import { ErrorInfoSchema } from "@/protogen/google/rpc/error_details_pb";
import {
  ListWorkflowNodesResponseSchema,
  ListWorkflowsResponseSchema,
  WorkflowSchema,
  WorkflowService,
  WorkflowStatus,
} from "@/protogen/querylane/console/v1alpha1/workflow_pb";
import { createTestQueryClient } from "@/test/query-client";

const GRANT_USAGE_TEXT = /df\.grant_usage/;
const NOT_SORTED_BUTTON_NAME_RE = /not sorted/;
const WORKFLOW_ID_LINK_NAME_RE = /^wf-/;

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

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
    expect(
      screen.queryByRole("button", { name: NOT_SORTED_BUTTON_NAME_RE })
    ).toBeNull();
  });

  test("loads older workflows only when requested", async () => {
    const user = userEvent.setup();
    const pageTokens: string[] = [];
    const transport = createRouterTransport(({ service }) => {
      service(WorkflowService, {
        listWorkflows(request) {
          pageTokens.push(request.pageToken);
          return create(ListWorkflowsResponseSchema, {
            nextPageToken: request.pageToken ? "" : "older-page",
            workflows: [
              {
                name: `instances/local/databases/postgres/workflows/${request.pageToken ? "wf-older" : "wf-newer"}`,
                status: WorkflowStatus.COMPLETED,
                workflowId: request.pageToken ? "wf-older" : "wf-newer",
              },
            ],
          });
        },
      });
    });

    renderWithRouter(transport, LIST_ENTRY);

    expect(await screen.findByRole("link", { name: "wf-newer" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "wf-older" })).toBeNull();
    expect(pageTokens).toEqual([""]);

    await user.click(screen.getByRole("button", { name: "Load more" }));

    expect(await screen.findByRole("link", { name: "wf-older" })).toBeTruthy();
    expect(pageTokens).toEqual(["", "older-page"]);
    expect(
      screen
        .getAllByRole("link", { name: WORKFLOW_ID_LINK_NAME_RE })
        .map((link) => link.textContent)
    ).toEqual(["wf-newer", "wf-older"]);
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  test("keeps server-backed filters available when no workflow matches", async () => {
    const user = userEvent.setup();
    const filters: string[] = [];
    const transport = createRouterTransport(({ service }) => {
      service(WorkflowService, {
        listWorkflows(request) {
          filters.push(request.filter);
          return create(ListWorkflowsResponseSchema, {
            workflows: request.filter
              ? []
              : [
                  {
                    name: "instances/local/databases/postgres/workflows/wf-1",
                    status: WorkflowStatus.COMPLETED,
                    workflowId: "wf-1",
                  },
                ],
          });
        },
      });
    });

    renderWithRouter(transport, LIST_ENTRY);
    const search = await screen.findByRole("textbox", {
      name: "Search workflows...",
    });

    await user.type(search, "docs");

    expect(await screen.findByText("No workflows found")).toBeTruthy();
    expect(
      screen.getByRole("textbox", { name: "Search workflows..." })
    ).toBeTruthy();
    await waitFor(() =>
      expect(filters.at(-1)).toBe('(name:"docs" OR label:"docs")')
    );

    await user.click(screen.getByRole("button", { name: "Status" }));
    await user.click(screen.getByRole("option", { name: "Running" }));
    await waitFor(() =>
      expect(filters.at(-1)).toBe(
        '(name:"docs" OR label:"docs") AND (status = "running")'
      )
    );
  });

  test("shows the not-installed state on FailedPrecondition", async () => {
    const transport = createRouterTransport(({ service }) => {
      service(WorkflowService, {
        listWorkflows() {
          throw new ConnectError(
            "pg_durable extension is not installed in this database",
            Code.FailedPrecondition,
            undefined,
            [
              {
                desc: ErrorInfoSchema,
                value: create(ErrorInfoSchema, {
                  metadata: { pg_durable_state: "not_installed" },
                }),
              },
            ]
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

  test("shows the access-denied state on PermissionDenied", async () => {
    const transport = createRouterTransport(({ service }) => {
      service(WorkflowService, {
        listWorkflows() {
          throw new ConnectError(
            "pg_durable is installed but this role lacks access to the df schema",
            Code.PermissionDenied,
            undefined,
            [
              {
                desc: ErrorInfoSchema,
                value: create(ErrorInfoSchema, {
                  metadata: { pg_durable_state: "access_denied" },
                }),
              },
            ]
          );
        },
      });
    });

    renderWithRouter(transport, LIST_ENTRY);

    expect(
      await screen.findByText("This role cannot see workflows")
    ).toBeTruthy();
    expect(screen.getByText(GRANT_USAGE_TEXT)).toBeTruthy();
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

  test("refreshes workflow nodes while the parent runs and stops when terminal", async () => {
    vi.useFakeTimers();
    let workflowRequests = 0;
    let nodeRequests = 0;
    const transport = createRouterTransport(({ service }) => {
      service(WorkflowService, {
        getWorkflow(request) {
          workflowRequests += 1;
          return create(WorkflowSchema, {
            name: request.name,
            status:
              workflowRequests === 1
                ? WorkflowStatus.RUNNING
                : WorkflowStatus.COMPLETED,
            workflowId: "wf-01hq3",
          });
        },
        listWorkflowNodes() {
          nodeRequests += 1;
          return create(ListWorkflowNodesResponseSchema, {
            workflowNodes: [
              {
                nodeId: "node-1",
                status: nodeRequests < 3 ? "running" : "completed",
              },
            ],
          });
        },
      });
    });

    renderWithRouter(transport, DETAIL_ENTRY);
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect([workflowRequests, nodeRequests]).toEqual([1, 1]);

    await act(() => vi.advanceTimersByTimeAsync(QUERY_STALE_TIME.workflowList));
    expect([workflowRequests, nodeRequests]).toEqual([2, 2]);

    await act(() => vi.advanceTimersByTimeAsync(QUERY_STALE_TIME.workflowList));
    expect([workflowRequests, nodeRequests]).toEqual([2, 3]);

    await act(() => vi.advanceTimersByTimeAsync(QUERY_STALE_TIME.workflowList));
    expect([workflowRequests, nodeRequests]).toEqual([2, 3]);
  });

  test("makes diagnostic query and result values focusable and copyable", async () => {
    const user = userEvent.setup();
    const originalClipboard = navigator.clipboard;
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const query =
      "SELECT document_id, embedding FROM documents WHERE tenant_id = 42";
    const result = '{"error":"embedding provider unavailable after retries"}';
    const transport = createRouterTransport(({ service }) => {
      service(WorkflowService, {
        getWorkflow(request) {
          return create(WorkflowSchema, {
            name: request.name,
            status: WorkflowStatus.FAILED,
            workflowId: "wf-01hq3",
          });
        },
        listWorkflowNodes() {
          return create(ListWorkflowNodesResponseSchema, {
            workflowNodes: [{ nodeId: "node-1", query, result }],
          });
        },
      });
    });

    try {
      renderWithRouter(transport, DETAIL_ENTRY);

      const queryValue = await screen.findByText(query);
      expect(queryValue.tabIndex).toBe(0);
      for (
        let step = 0;
        step < 10 && document.activeElement !== queryValue;
        step += 1
      ) {
        await user.tab();
      }
      expect(document.activeElement).toBe(queryValue);

      await user.click(screen.getByRole("button", { name: "Copy query" }));
      await user.click(screen.getByRole("button", { name: "Copy result" }));
      expect(writeText).toHaveBeenNthCalledWith(1, query);
      expect(writeText).toHaveBeenNthCalledWith(2, result);
    } finally {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: originalClipboard,
      });
    }
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

  test("surfaces a steps error with retry when GetWorkflow succeeds but nodes fail", async () => {
    const transport = createRouterTransport(({ service }) => {
      service(WorkflowService, {
        getWorkflow(request) {
          return create(WorkflowSchema, {
            name: request.name,
            status: WorkflowStatus.RUNNING,
            workflowId: "wf-01hq3",
          });
        },
        listWorkflowNodes() {
          throw new ConnectError("nodes unavailable", Code.Unavailable);
        },
      });
    });

    renderWithRouter(transport, DETAIL_ENTRY);

    // The workflow itself still renders...
    expect(
      await screen.findByRole("heading", { name: "wf-01hq3" })
    ).toBeTruthy();
    // ...but the Steps section shows an error + retry, not a false "no steps".
    expect(
      await screen.findByText("Could not load the workflow steps.")
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });
});
