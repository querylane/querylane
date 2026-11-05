import { afterEach, expect, test } from "@rstest/core";
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
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { z } from "zod";
import { UrlListColumnsProvider } from "@/components/list-columns-provider";
import { DataTable } from "@/components/querylane-ui/data-table";
import type { DataTableColumnDef } from "@/components/querylane-ui/data-table-model";
import { listColumnsSearchSchema } from "@/lib/list-columns";

afterEach(cleanup);
interface Row {
  name: string;
  owner: string;
}
const columns: DataTableColumnDef<Row>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "owner", header: "Owner" },
];
function Lists() {
  return (
    <>
      <section aria-label="First">
        <DataTable
          columns={columns}
          data={[{ name: "analytics", owner: "postgres" }]}
          tableKey="first"
        />
      </section>
      <section aria-label="Second">
        <DataTable columns={columns} data={[]} tableKey="second" />
      </section>
    </>
  );
}
function testRouter(url: string) {
  const root = createRootRoute({
    validateSearch: listColumnsSearchSchema.extend({
      q: z.string().optional(),
    }),
    component: () => (
      <UrlListColumnsProvider>
        <Outlet />
      </UrlListColumnsProvider>
    ),
  });
  const child = createRoute({
    getParentRoute: () => root,
    path: "/lists",
    component: Lists,
  });
  return createRouter({
    routeTree: root.addChildren([child]),
    history: createMemoryHistory({ initialEntries: [url] }),
  });
}

test("selections stay in the current URL, survive reload, preserve filters and isolate lists", async () => {
  const user = userEvent.setup();
  const router = testRouter("/lists?q=analytics");
  render(<RouterProvider router={router} />);
  const first = await screen.findByRole("region", { name: "First" });
  await user.click(within(first).getByRole("button", { name: "Columns" }));
  await user.click(screen.getByRole("menuitemcheckbox", { name: "Owner" }));
  await waitFor(() => {
    expect(router.state.location.search).toEqual({
      q: "analytics",
      columns: { first: ["name"] },
    });
  });
  expect(router.state.location.pathname).toBe("/lists");
  expect(
    within(first).queryByRole("columnheader", { name: "Owner" })
  ).toBeNull();
  expect(
    within(screen.getByRole("region", { name: "Second" })).getByRole(
      "columnheader",
      { name: "Owner" }
    )
  ).toBeTruthy();
  const url = router.state.location.href;
  cleanup();
  render(<RouterProvider router={testRouter(url)} />);
  const restored = await screen.findByRole("region", { name: "First" });
  expect(
    within(restored).queryByRole("columnheader", { name: "Owner" })
  ).toBeNull();
  // An externally supplied URL (history navigation) is authoritative, not stale local state.
  const freshRouter = testRouter(url);
  cleanup();
  render(<RouterProvider router={freshRouter} />);
  await screen.findByRole("region", { name: "First" });
  await act(async () => {
    freshRouter.history.push("/lists?q=analytics");
    await freshRouter.load();
  });
  expect(
    within(screen.getByRole("region", { name: "First" })).getByRole(
      "columnheader",
      { name: "Owner" }
    )
  ).toBeTruthy();
});
