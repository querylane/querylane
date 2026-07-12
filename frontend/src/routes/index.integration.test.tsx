import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { PostgresInstance } from "@/lib/db-resource-mappers";
import { Route } from "@/routes/index";

const state = vi.hoisted(() => ({
  instances: [] as PostgresInstance[],
  navigate: vi.fn(async () => undefined),
  search: {} as { instanceId?: string | undefined },
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute:
    () => (options: { component: () => unknown; validateSearch: unknown }) => ({
      fullPath: "/",
      options,
      useSearch: () => state.search,
    }),
  useNavigate: () => state.navigate,
}));

vi.mock("@/hooks/api/console", () => ({
  useConsoleConfigStatus: () => ({
    configFilePath: "",
    isConfigManaged: false,
    isLoaded: true,
  }),
}));

vi.mock("@/lib/db-context", () => ({
  useDb: () => ({
    instances: state.instances,
    queryStates: {
      instances: {
        error: null,
        hasResolved: true,
      },
    },
    retryInstanceCatalog: vi.fn(async () => undefined),
  }),
}));

function instance(id: string, credentialsUnreadable = false): PostgresInstance {
  return {
    connectionError: "",
    credentialsUnreadable,
    host: `${id}.internal`,
    id,
    name: id,
    port: 5432,
    resourceName: `instances/${id}`,
    status: credentialsUnreadable ? "error" : "connected",
  };
}

beforeEach(() => {
  state.instances = [];
  state.navigate.mockReset();
  state.navigate.mockResolvedValue(undefined);
  state.search = {};
});

afterEach(() => {
  cleanup();
});

describe("home instance redirect", () => {
  test("opens configuration when every instance needs credential recovery", async () => {
    state.instances = [instance("broken", true)];
    const HomeRedirectPage = Route.options.component;
    if (!HomeRedirectPage) {
      throw new Error("Expected home route component");
    }

    render(<HomeRedirectPage />);

    await waitFor(() => {
      expect(state.navigate).toHaveBeenCalledWith({
        params: { instanceId: "broken" },
        replace: true,
        to: "/instances/$instanceId/configuration",
      });
    });
  });

  test("opens the first healthy instance overview", async () => {
    state.instances = [instance("broken", true), instance("healthy")];
    const HomeRedirectPage = Route.options.component;
    if (!HomeRedirectPage) {
      throw new Error("Expected home route component");
    }

    render(<HomeRedirectPage />);

    await waitFor(() => {
      expect(state.navigate).toHaveBeenCalledWith({
        params: { instanceId: "healthy" },
        replace: true,
        to: "/instances/$instanceId",
      });
    });
  });
});
