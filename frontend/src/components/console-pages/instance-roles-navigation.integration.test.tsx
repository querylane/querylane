import { create } from "@bufbuild/protobuf";
import { afterEach, expect, rs, test } from "@rstest/core";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  useParams,
} from "@tanstack/react-router";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useSyncExternalStore } from "react";
import { UrlListColumnsProvider } from "@/components/list-columns-provider";
import { instanceRolesSearchSchema } from "@/lib/instance-roles-search";
import { listColumnsSearchSchema } from "@/lib/list-columns";
import { RoleSchema } from "@/protogen/querylane/console/v1alpha1/role_pb";
import { actSynchronous } from "@/test/async-act";
import { InstanceRolesPage } from "./instance-roles-page";

const USERS_LABEL = /Users/u;
const CONNECTION_LIMIT = /Conn limit/u;
const role = create(RoleSchema, {
  name: "instances/local/roles/member",
  roleName: "member",
});
let rolesPending = false;
const queryListeners = new Set<() => void>();
function subscribeFixture(listener: () => void) {
  queryListeners.add(listener);
  return () => {
    queryListeners.delete(listener);
  };
}
function fixturePending() {
  return rolesPending;
}
function useFixtureRolesQuery() {
  const isPending = useSyncExternalStore(subscribeFixture, fixturePending);
  return {
    data: isPending ? undefined : { roles: [role], nextPageToken: "" },
    error: null,
    isPending,
    isFetching: isPending,
    refetch: () => Promise.resolve(undefined),
  };
}
rs.mock("@/hooks/api/role", () => ({
  rolesForInstanceQueryInput: (instanceId: string) => ({
    parent: `instances/${instanceId}`,
  }),
  useListAllRolesQuery: useFixtureRolesQuery,
  useRolesAccessMapResourcesQuery: () => ({
    data: undefined,
    error: null,
    isPending: false,
  }),
}));
rs.mock("@/components/console-pages/roles-access-map-canvas", () => ({
  RolesAccessMapCanvas: EmptyAccessMap,
}));

function EmptyAccessMap() {
  return null;
}
function RolesRoute() {
  const { instanceId } = useParams({ from: "/instances/$instanceId/roles/" });
  return (
    <InstanceRolesPage
      instanceId={instanceId}
      searchRoute="/instances/$instanceId/roles/"
    />
  );
}

afterEach(() => {
  cleanup();
  rolesPending = false;
  rs.restoreAllMocks();
});

function ColumnsRoot() {
  return (
    <UrlListColumnsProvider>
      <Outlet />
    </UrlListColumnsProvider>
  );
}
async function setup(entry = "/instances/local/roles/") {
  const root = createRootRoute({
    component: ColumnsRoot,
    validateSearch: listColumnsSearchSchema,
  });
  const instance = createRoute({
    getParentRoute: () => root,
    path: "instances/$instanceId",
    component: Outlet,
  });
  const roles = createRoute({
    getParentRoute: () => instance,
    path: "roles",
    component: Outlet,
  });
  const index = createRoute({
    getParentRoute: () => roles,
    path: "/",
    validateSearch: instanceRolesSearchSchema,
    component: RolesRoute,
  });
  const away = createRoute({
    getParentRoute: () => root,
    path: "away",
    component: () => <h1>Elsewhere</h1>,
  });
  const router = createRouter({
    routeTree: root.addChildren([
      instance.addChildren([roles.addChildren([index])]),
      away,
    ]),
    history: createMemoryHistory({
      initialEntries: [entry],
    }),
  });
  await router.load();
  render(<RouterProvider router={router} />);
  await screen.findByRole("textbox", { name: "Search roles…" });
  return router;
}

test.each(["sort", "tab"] as const)(
  "cancelled search publication cannot resume a stale %s action after leaving roles",
  async (action) => {
    const router = await setup();
    const gate = Promise.withResolvers<void>();
    const { navigate } = router;
    rs.spyOn(router, "navigate").mockImplementation(async (options) => {
      await navigate(options);
      if (typeof options.state === "function") {
        await gate.promise;
      }
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Search roles…" }), {
      target: { value: "draft" },
    });
    await actSynchronous(act, () => {
      fireEvent.click(
        action === "sort"
          ? screen.getByRole("button", { name: CONNECTION_LIMIT })
          : screen.getByRole("tab", { name: "Access map" })
      );
    });
    await waitFor(() => {
      expect(router.state.location.search.q).toBe("draft");
    });
    await act(async () => {
      await router.navigate({ href: "/away" });
      gate.resolve();
    });
    await screen.findByRole("heading", { name: "Elsewhere" });
    expect(router.state.location.pathname).toBe("/away");
  }
);

test.each(["sort", "tab"] as const)(
  "successful search publication preserves the following %s action",
  async (action) => {
    const router = await setup();
    fireEvent.change(screen.getByRole("textbox", { name: "Search roles…" }), {
      target: { value: "draft" },
    });
    await actSynchronous(act, () => {
      fireEvent.click(
        action === "sort"
          ? screen.getByRole("button", { name: CONNECTION_LIMIT })
          : screen.getByRole("tab", { name: "Access map" })
      );
    });
    await waitFor(() => {
      expect(router.state.location.search.q).toBe("draft");
      expect(
        action === "sort"
          ? router.state.location.search.sort
          : router.state.location.search.tab
      ).toBe(action === "sort" ? "connLimit:asc" : "map");
    });
  }
);

test("role type and tab navigation retain validated root column selections", async () => {
  const user = userEvent.setup();
  const router = await setup(
    "/instances/local/roles/?columns=%7B%22instance-roles%22%3A%5B%22roleName%22%5D%2C%22other%22%3A%5B%22name%22%5D%7D&sort=connLimit%3Adesc#table"
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Search roles…" }), {
    target: { value: "member" },
  });
  await user.click(screen.getByRole("button", { name: "Type" }));
  await user.click(screen.getByRole("menuitemcheckbox", { name: USERS_LABEL }));
  await waitFor(() => {
    expect(router.state.location.search.type).toBe("login");
  });
  await user.click(screen.getByRole("tab", { name: "Access map" }));
  await waitFor(() => {
    expect(router.state.location.search.tab).toBe("map");
  });
  expect(router.state.location.search.columns).toEqual({
    "instance-roles": ["roleName"],
    other: ["name"],
  });
  expect(router.state.location.search.q).toBe("member");
  expect(router.state.location.search.sort).toBe("connLimit:desc");
  expect(router.state.location.hash).toBe("table");
});

test("combined URL providers retain input identity and focus from pending to loaded roles", async () => {
  rolesPending = true;
  const router = await setup(
    "/instances/local/roles/?columns=%7B%22instance-roles%22%3A%5B%22roleName%22%5D%2C%22other%22%3A%5B%22name%22%5D%7D"
  );
  const input = screen.getByRole("textbox", { name: "Search roles…" });
  input.focus();
  expect(screen.getAllByRole("columnheader")).toHaveLength(1);
  expect(screen.queryByText("member")).toBeNull();
  await actSynchronous(act, () => {
    rolesPending = false;
    for (const notify of queryListeners) {
      notify();
    }
  });
  await screen.findByText("member");
  expect(screen.getByRole("textbox", { name: "Search roles…" })).toBe(input);
  expect(input.isConnected).toBe(true);
  expect(document.activeElement).toBe(input);
  expect(router.state.location.search.columns).toEqual({
    "instance-roles": ["roleName"],
    other: ["name"],
  });
});

test("the Login header publishes and restores its accessible sorting state", async () => {
  const user = userEvent.setup();
  const router = await setup();
  await user.click(screen.getByRole("button", { name: "Login, not sorted" }));
  await waitFor(() => {
    expect(router.state.location.search.sort).toBe("login:asc");
  });
  expect(
    screen
      .getByRole("columnheader", { name: "Login" })
      .getAttribute("aria-sort")
  ).toBe("ascending");
});
