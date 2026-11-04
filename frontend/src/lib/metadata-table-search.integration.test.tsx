import { expect, test } from "@rstest/core";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UrlListColumnsProvider } from "@/components/list-columns-provider";
import { DataTable } from "@/components/querylane-ui/data-table";
import { SortableHeader } from "@/components/querylane-ui/data-table-controls";
import type { DataTableColumnDef } from "@/components/querylane-ui/data-table-model";
import { Input } from "@/components/ui/input";
import { instanceRolesSearchSchema } from "@/lib/instance-roles-search";
import { listColumnsSearchSchema } from "@/lib/list-columns";
import { handleAsyncAction } from "@/lib/ui-action";
import { useUrlTableSearch, useUrlTableSorting } from "@/lib/url-search-state";
import { actSynchronous } from "@/test/async-act";

const CONNECTION_LIMIT_LABEL = /Conn limit/iu;
const columns: DataTableColumnDef<{ roleName: string; connLimit: number }>[] = [
  {
    accessorKey: "roleName",
    header: ({ column }) => (
      <SortableHeader column={column}>Role</SortableHeader>
    ),
  },
  {
    accessorKey: "connLimit",
    header: ({ column }) => (
      <SortableHeader column={column}>Conn limit</SortableHeader>
    ),
  },
];
const rows = Array.from({ length: 30 }, (_, index) => ({
  roleName: `role_${String(index).padStart(2, "0")}`,
  connLimit: index,
}));
function MetadataList() {
  const [q, setQ, flush] = useUrlTableSearch("/instances/$instanceId/roles/", {
    debounce: true,
  });
  const [sorting, setSorting] = useUrlTableSorting(
    "/instances/$instanceId/roles/",
    "roles"
  );
  return (
    <>
      <Input
        aria-label="Search roles"
        onBlur={handleAsyncAction(flush)}
        onChange={(event) => {
          handleAsyncAction(setQ)(event.target.value);
        }}
        value={q}
      />
      <DataTable
        columns={columns}
        data={rows}
        filterColumn="roleName"
        filterValue={q}
        onFilterChange={handleAsyncAction(setQ)}
        onSortingChange={handleAsyncAction(async (next) => {
          await flush();
          setSorting(next);
        })}
        pageSize={25}
        sorting={sorting}
        tableKey="instance-roles"
      />
    </>
  );
}
function ColumnsRoot() {
  return (
    <UrlListColumnsProvider>
      <Outlet />
    </UrlListColumnsProvider>
  );
}
async function setup(entry: string) {
  const root = createRootRoute({
    validateSearch: listColumnsSearchSchema,
    component: ColumnsRoot,
  });
  const roles = createRoute({
    getParentRoute: () => root,
    path: "instances/$instanceId/roles",
    component: Outlet,
  });
  const route = createRoute({
    getParentRoute: () => roles,
    path: "/",
    validateSearch: instanceRolesSearchSchema,
    component: MetadataList,
  });
  const history = createMemoryHistory({ initialEntries: [entry] });
  const router = createRouter({
    routeTree: root.addChildren([roles.addChildren([route])]),
    history,
  });
  await router.load();
  const view = render(<RouterProvider router={router} />);
  await screen.findByRole("textbox", { name: "Search roles" });
  return { router, history, ...view };
}

test("deep-link sorting covers all loaded rows, resets pagination, and restores through history and reload", async () => {
  const user = userEvent.setup();
  const { router, history, unmount } = await setup(
    "/instances/local/roles/?sort=connLimit%3Adesc#table"
  );
  expect(screen.getAllByRole("cell")[0]?.textContent).toBe("role_29");
  await user.click(screen.getByRole("button", { name: "Next page" }));
  expect(screen.getByText("Page 2 of 2")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Role, not sorted" }));
  await waitFor(() => {
    expect(screen.getByText("Page 1 of 2")).toBeTruthy();
  });
  expect(screen.getAllByRole("cell")[0]?.textContent).toBe("role_00");
  expect(router.state.location.search.sort).toBe("roleName:asc");
  expect(router.state.location.hash).toBe("table");
  await actSynchronous(act, () => {
    history.push("/instances/local/roles/?sort=roleName%3Adesc#table");
  });
  expect(screen.getAllByRole("cell")[0]?.textContent).toBe("role_29");
  await actSynchronous(act, () => {
    history.back();
  });
  expect(screen.getAllByRole("cell")[0]?.textContent).toBe("role_00");
  await actSynchronous(act, () => {
    history.forward();
  });
  expect(screen.getAllByRole("cell")[0]?.textContent).toBe("role_29");
  const { href } = router.state.location;
  unmount();
  await setup(href);
  expect(screen.getAllByRole("cell")[0]?.textContent).toBe("role_29");
});

test("sorting flushes the immediate filter draft without a second debounce and preserves the unsorted URL state", async () => {
  const user = userEvent.setup();
  const { router } = await setup(
    "/instances/local/roles/?sort=roleName%3Adesc"
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Search roles" }), {
    target: { value: "role_2" },
  });
  await user.click(
    screen.getByRole("button", { name: "Role, sorted descending" })
  );
  await waitFor(() => {
    expect(router.state.location.search.sort).toBe("none");
  });
  expect(router.state.location.search.q).toBe("role_2");
  expect(screen.getByRole("button", { name: "Role, not sorted" })).toBeTruthy();
});

test("column toggle and reset compose with queued search, hidden sorting, cross-list selections and hash", async () => {
  const user = userEvent.setup();
  const { router, history, unmount } = await setup(
    "/instances/local/roles/?sort=connLimit%3Adesc&columns=%7B%22other%22%3A%5B%22name%22%5D%7D#table"
  );
  const search = screen.getByRole("textbox", { name: "Search roles" });
  search.focus();
  fireEvent.change(search, { target: { value: "role_2" } });
  // A keyboard-like click can select a column before the input blur flush.
  fireEvent.click(screen.getByRole("button", { name: "Columns" }));
  await user.click(
    screen.getByRole("menuitemcheckbox", { name: CONNECTION_LIMIT_LABEL })
  );
  await waitFor(() => {
    expect(router.state.location.search.columns).toEqual({
      other: ["name"],
      "instance-roles": ["roleName"],
    });
  });
  expect(search.getAttribute("value")).toBe("role_2");
  await waitFor(() => {
    expect(router.state.location.search.q).toBe("role_2");
  });
  expect(router.state.location.search.sort).toBe("connLimit:desc");
  expect(router.state.location.hash).toBe("table");
  expect(screen.getAllByRole("cell")[0]?.textContent).toBe("role_29");
  fireEvent.change(search, { target: { value: "role_1" } });
  await user.click(screen.getByRole("menuitem", { name: "Reset columns" }));
  await waitFor(() => {
    expect(router.state.location.search.q).toBe("role_1");
  });
  expect(router.state.location.search.columns).toEqual({ other: ["name"] });
  expect(screen.getAllByRole("columnheader")).toHaveLength(2);
  const { href } = router.state.location;
  unmount();
  const restored = await setup(href);
  expect(restored.router.state.location.search.q).toBe("role_1");
  fireEvent.change(screen.getByRole("textbox", { name: "Search roles" }), {
    target: { value: "stale" },
  });
  await actSynchronous(act, () => {
    restored.history.push("/instances/local/roles/?q=role_0&sort=none");
  });
  await waitFor(() => {
    expect(
      screen
        .getByRole("textbox", { name: "Search roles" })
        .getAttribute("value")
    ).toBe("role_0");
  });
  expect(restored.router.state.location.search.columns).toBeUndefined();
  expect(history.location.href).toBe(href);
});

test("existing list-layout sort bookmarks remain effective until an explicit metadata sort replaces them", async () => {
  const user = userEvent.setup();
  const { router, unmount } = await setup(
    `/instances/local/roles/?listSort=${encodeURIComponent(JSON.stringify({ "instance-roles": [{ id: "connLimit", desc: true }] }))}&columnOrder=${encodeURIComponent(JSON.stringify({ "instance-roles": ["connLimit", "roleName"] }))}`
  );
  expect(screen.getAllByRole("cell")[1]?.textContent).toBe("role_29");
  await user.click(screen.getByRole("button", { name: "Role, not sorted" }));
  await waitFor(() => {
    expect(router.state.location.search.sort).toBe("roleName:asc");
  });
  expect(screen.getAllByRole("cell")[1]?.textContent).toBe("role_00");
  const { href } = router.state.location;
  unmount();
  await setup(href);
  expect(screen.getAllByRole("cell")[1]?.textContent).toBe("role_00");
});
