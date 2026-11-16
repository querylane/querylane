import { afterEach, expect, rs, test } from "@rstest/core";
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
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import * as navigationErrorsActual from "@/lib/navigation-errors" with {
  rstest: "importActual",
};
import { handleNavigationError } from "@/lib/navigation-errors";
import { handleAsyncAction } from "@/lib/ui-action";
import { useUrlTableSearch } from "@/lib/url-search-state";
import { actSynchronous } from "@/test/async-act";

rs.mock("@/lib/navigation-errors", () => ({
  ...navigationErrorsActual,
  handleNavigationError: rs.fn(),
}));

function SearchProbe({
  observe,
  observeFlush,
}: {
  observeFlush: (promise: Promise<boolean>) => void;
  observe: (promise: Promise<void>) => void;
}) {
  const [draft, setDraft, flush] = useUrlTableSearch(
    "/instances/$instanceId/",
    { debounce: true }
  );
  return (
    <>
      <Input
        aria-label="Search"
        onBlur={() => {
          handleAsyncAction(flush)();
        }}
        onChange={(event) => {
          observe(setDraft(event.target.value));
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            handleAsyncAction(flush)();
          }
        }}
        value={draft}
      />
      <Button
        onClick={() => {
          observeFlush(flush());
        }}
      >
        Continue
      </Button>
      <Button
        onClick={() => {
          handleAsyncAction(setDraft)("");
        }}
      >
        Clear
      </Button>
    </>
  );
}
async function setup(
  observe: (promise: Promise<void>) => void = () => undefined,
  observeFlush: (promise: Promise<boolean>) => void = () => undefined
) {
  const root = createRootRoute({ component: Outlet });
  const layout = createRoute({
    getParentRoute: () => root,
    path: "instances/$instanceId",
    component: Outlet,
  });
  const route = createRoute({
    getParentRoute: () => layout,
    path: "/",
    validateSearch: z.object({
      q: z.string().optional(),
      tab: z.string().optional(),
    }),
    component: () => (
      <SearchProbe observe={observe} observeFlush={observeFlush} />
    ),
  });
  const history = createMemoryHistory({
    initialEntries: [
      "/instances/local/?q=before&tab=details#table",
      "/instances/local/?q=start&tab=details#table",
    ],
  });
  const router = createRouter({
    routeTree: root.addChildren([layout.addChildren([route])]),
    history,
  });
  await router.load();
  const view = render(<RouterProvider router={router} />);
  await screen.findByRole("textbox", { name: "Search" });
  return { router, history, ...view };
}
afterEach(() => {
  rs.useRealTimers();
});

test("typing is immediate but URL publication is debounced, preserving neighboring search and hash", async () => {
  const { router } = await setup();
  rs.useFakeTimers();
  const input = screen.getByRole("textbox", { name: "Search" });
  fireEvent.change(input, { target: { value: "app" } });
  expect(input.getAttribute("value")).toBe("app");
  expect(router.state.location.search).toEqual({ q: "start", tab: "details" });
  await act(async () => {
    await rs.advanceTimersByTimeAsync(200);
  });
  expect(router.state.location.search).toEqual({ q: "app", tab: "details" });
  expect(router.state.location.hash).toBe("table");
});

test("enter and blur flush, clear publishes immediately, and history cancels a queued draft", async () => {
  const { router, history } = await setup();
  rs.useFakeTimers();
  const input = screen.getByRole("textbox", { name: "Search" });
  fireEvent.change(input, { target: { value: "app" } });
  await actSynchronous(act, () => {
    fireEvent.keyDown(input, { key: "Enter" });
  });
  expect(router.state.location.search.q).toBe("app");
  fireEvent.change(input, { target: { value: "blurred" } });
  await actSynchronous(act, () => {
    fireEvent.blur(input);
  });
  expect(router.state.location.search.q).toBe("blurred");
  await actSynchronous(act, () => {
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
  });
  expect(router.state.location.search.q).toBeUndefined();
  fireEvent.change(input, { target: { value: "discard" } });
  await actSynchronous(act, () => {
    history.back();
  });
  expect(input.getAttribute("value")).toBe("before");
  await act(async () => {
    await rs.advanceTimersByTimeAsync(300);
  });
  expect(router.state.location.search.q).toBe("before");
  rs.useRealTimers();
  await actSynchronous(act, () => {
    history.forward();
  });
  await waitFor(() => {
    expect(input.getAttribute("value")).toBe("");
  });
});

test.each(["resolve", "reject"])(
  "%s: an older navigation completion cannot overwrite typing, and failures roll back only the current revision",
  async (outcome) => {
    const { router } = await setup();
    const gate = Promise.withResolvers<void>();
    const { navigate } = router;
    const navigation = rs
      .spyOn(router, "navigate")
      .mockImplementation(async (options) => {
        await navigate(options);
        await gate.promise;
      });
    const input = screen.getByRole("textbox", { name: "Search" });
    fireEvent.change(input, { target: { value: "older" } });
    await actSynchronous(act, () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });
    fireEvent.change(input, { target: { value: "newer" } });
    await actSynchronous(act, () => {
      if (outcome === "reject") {
        gate.reject(new Error("Older write failed"));
      } else {
        gate.resolve();
      }
    });
    expect(input.getAttribute("value")).toBe("newer");
    navigation.mockRejectedValue(new Error("History write failed"));
    await actSynchronous(act, () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });
    expect(input.getAttribute("value")).toBe("older");
    expect(handleNavigationError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "History write failed" }),
      { area: "url-table-search" }
    );
  }
);

test("disposal settles every setter promise, including superseded in-flight publications", async () => {
  const promises: Promise<void>[] = [];
  const { router, unmount } = await setup((promise) => {
    promises.push(promise);
  });
  const gate = Promise.withResolvers<void>();
  const { navigate } = router;
  rs.spyOn(router, "navigate").mockImplementation(async (options) => {
    await navigate(options);
    await gate.promise;
  });
  rs.useFakeTimers();
  const input = screen.getByRole("textbox", { name: "Search" });
  fireEvent.change(input, { target: { value: "first" } });
  await actSynchronous(act, () => {
    fireEvent.keyDown(input, { key: "Enter" });
  });
  fireEvent.change(input, { target: { value: "second" } });
  await actSynchronous(act, () => {
    fireEvent.keyDown(input, { key: "Enter" });
  });
  fireEvent.change(input, { target: { value: "queued" } });
  let settled = 0;
  function countSettlement() {
    settled += 1;
  }
  for (const promise of promises) {
    promise.then(countSettlement).catch((error: unknown) => {
      throw error;
    });
  }
  unmount();
  await act(async () => {
    await rs.advanceTimersByTimeAsync(0);
  });
  expect(settled).toBe(3);
  await act(async () => {
    await rs.advanceTimersByTimeAsync(300);
  });
  expect(router.state.location.search.q).toBe("second");
  gate.resolve();
  await Promise.all(promises);
});

test("synchronous history write failures use the navigation handler and settle the setter promise", async () => {
  const promises: Promise<void>[] = [];
  const { router } = await setup((promise) => {
    promises.push(promise);
  });
  rs.spyOn(router, "navigate").mockImplementation(() => {
    throw new Error("History quota exceeded");
  });
  const input = screen.getByRole("textbox", { name: "Search" });
  fireEvent.change(input, { target: { value: "draft" } });
  await actSynchronous(act, () => {
    fireEvent.keyDown(input, { key: "Enter" });
  });
  await Promise.all(promises);
  expect(input.getAttribute("value")).toBe("start");
  expect(handleNavigationError).toHaveBeenCalledWith(
    expect.objectContaining({ message: "History quota exceeded" }),
    { area: "url-table-search" }
  );
});

test("an idle flush cannot authorize an action after a newer draft supersedes it", async () => {
  const results: Promise<boolean>[] = [];
  await setup(undefined, (result) => {
    results.push(result);
  });
  await actSynchronous(act, () => {
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  });
  expect(await results[0]).toBe(true);
  await actSynchronous(act, () => {
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Search" }), {
      target: { value: "newer" },
    });
  });
  expect(await results[1]).toBe(false);
});
