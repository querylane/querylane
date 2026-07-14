import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
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
import { afterEach, describe, expect, it, vi } from "vitest";
import { Input } from "@/components/ui/input";
import { useUrlTableSearch } from "@/lib/url-search-state";

afterEach(() => cleanup());

function SearchHarness() {
  const [query, setQuery] = useUrlTableSearch();

  return (
    <Input
      aria-label="Filter roles..."
      onChange={(event) => setQuery(event.target.value)}
      value={query}
    />
  );
}

function renderSearchHarness(initialEntry = "/instances/prod/roles") {
  const rootRoute = createRootRoute();
  const instanceRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "instances/$instanceId",
    validateSearch: (search: Record<string, unknown>) => ({
      q: typeof search["q"] === "string" ? search["q"] : undefined,
    }),
  });
  const rolesRoute = createRoute({
    component: SearchHarness,
    getParentRoute: () => instanceRoute,
    path: "roles",
  });
  const history = createMemoryHistory({ initialEntries: [initialEntry] });
  const router = createRouter({
    history,
    routeTree: rootRoute.addChildren([instanceRoute.addChildren([rolesRoute])]),
  });

  render(<RouterProvider router={router} />);

  return router;
}

describe("url table search state", () => {
  it("restores q from the URL", async () => {
    renderSearchHarness("/instances/prod/roles?q=app_user");

    const input =
      await screen.findByLabelText<HTMLInputElement>("Filter roles...");

    expect(input.value).toBe("app_user");
  });

  it("preserves spaces when writing search text", async () => {
    const router = renderSearchHarness();
    const input = await screen.findByLabelText("Filter roles...");

    fireEvent.change(input, {
      target: { value: "foo bar " },
    });

    await waitFor(() =>
      expect(router.history.location.search).toBe("?q=foo+bar+")
    );
  });

  it("omits empty q and replaces history when search is cleared", async () => {
    const user = userEvent.setup();
    const router = renderSearchHarness("/instances/prod/roles?q=app_user");
    const onReplace = vi.fn();

    router.history.subscribe(({ action, location }) => {
      if (action.type === "REPLACE") {
        onReplace(location.search);
      }
    });

    await user.clear(await screen.findByLabelText("Filter roles..."));

    await waitFor(() => expect(router.history.location.search).toBe(""));
    expect(router.history.location.pathname).toBe("/instances/prod/roles");
    expect(onReplace).toHaveBeenLastCalledWith("");
  });

  it("syncs the input when browser history changes q", async () => {
    const router = renderSearchHarness("/instances/prod/roles?q=first");
    const input =
      await screen.findByLabelText<HTMLInputElement>("Filter roles...");

    await act(() =>
      router.navigate({ href: "/instances/prod/roles?q=second" })
    );
    await waitFor(() => expect(input.value).toBe("second"));

    act(() => router.history.back());
    await waitFor(() => expect(input.value).toBe("first"));

    act(() => router.history.forward());
    await waitFor(() => expect(input.value).toBe("second"));
  });
});
