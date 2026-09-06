import { Code, ConnectError } from "@connectrpc/connect";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  rs,
  test,
} from "@rstest/core";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PostgresInstance } from "@/lib/db-resource-mappers";
import { Route } from "@/routes/index";
import { ThemeProvider } from "@/theme-provider";

const state = rs.hoisted(() => ({
  configFilePath: "",
  instancesError: null as Error | null,
  instances: [] as PostgresInstance[],
  navigate: rs.fn(async () => undefined),
  search: {} as { instanceId?: string | undefined },
  showDegradedBanner: false,
}));

rs.mock("@tanstack/react-router", () => ({
  createFileRoute:
    () => (options: { component: () => unknown; validateSearch: unknown }) => ({
      fullPath: "/",
      options,
      useSearch: () => state.search,
    }),
  useNavigate: () => state.navigate,
}));

rs.mock("@/hooks/api/console", () => ({
  useConsoleConfigStatus: () => ({
    configFilePath: state.configFilePath,
    isConfigManaged: false,
    isLoaded: true,
  }),
}));

rs.mock("@/lib/db-context", () => ({
  useDb: () => ({
    instances: state.instances,
    queryStates: {
      instances: {
        error: state.instancesError,
        hasResolved: true,
      },
    },
    retryInstanceCatalog: rs.fn(async () => undefined),
  }),
}));

rs.mock("@/stores/setup-store", () => ({
  useSetupStore: (
    selector: (value: { showDegradedBanner: boolean }) => unknown
  ) => selector({ showDegradedBanner: state.showDegradedBanner }),
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
  state.configFilePath = "";
  state.instancesError = null;
  state.instances = [];
  state.navigate.mockReset();
  state.navigate.mockResolvedValue(undefined);
  state.search = {};
  state.showDegradedBanner = false;
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

  test("offers storage recovery when the degraded instance catalog fails", async () => {
    const user = userEvent.setup();
    state.configFilePath = "/tmp/querylane/config.yaml";
    state.instancesError = new ConnectError(
      "database is currently unavailable",
      Code.Unavailable
    );
    state.showDegradedBanner = true;
    const HomeRedirectPage = Route.options.component;
    if (!HomeRedirectPage) {
      throw new Error("Expected home route component");
    }

    render(
      <ThemeProvider defaultTheme="light">
        <HomeRedirectPage />
      </ThemeProvider>
    );

    await user.click(
      screen.getByRole("button", { name: "Reconfigure internal storage" })
    );

    screen.getByRole("heading", { name: "Reconfigure internal storage" });
    screen.getByText("/tmp/querylane/config.yaml");
  });
});
