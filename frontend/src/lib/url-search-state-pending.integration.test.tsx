import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Input } from "@/components/ui/input";
import { useUrlTableSearch } from "@/lib/url-search-state";

const routerMocks = vi.hoisted(() => ({
  location: { hash: "", pathname: "/instances/prod/roles", searchStr: "" },
  navigate: vi.fn(),
  navigationRejects: [] as Array<(reason?: unknown) => void>,
  navigationResolves: [] as Array<() => void>,
  q: "",
}));

const navigationErrorMocks = vi.hoisted(() => ({
  handleNavigationError: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useLocation: () => routerMocks.location,
  useNavigate: () => routerMocks.navigate,
  useSearch: () => routerMocks.q,
}));

vi.mock("@/lib/navigation-errors", () => navigationErrorMocks);

function SearchHarness() {
  const [query, setQuery] = useUrlTableSearch();
  return (
    <Input
      aria-label="Search roles"
      onChange={(event) => setQuery(event.target.value)}
      value={query}
    />
  );
}

describe("useUrlTableSearch", () => {
  beforeEach(() => {
    routerMocks.navigate.mockClear();
    navigationErrorMocks.handleNavigationError.mockClear();
    routerMocks.navigationRejects = [];
    routerMocks.navigationResolves = [];
    routerMocks.navigate.mockImplementation(
      () =>
        new Promise<void>((resolve, reject) => {
          routerMocks.navigationRejects.push(reject);
          routerMocks.navigationResolves.push(resolve);
        })
    );
    routerMocks.q = "";
    routerMocks.location.searchStr = "";
  });

  it("bypasses blockers for same-page URL search changes", async () => {
    render(<SearchHarness />);

    fireEvent.change(
      screen.getByRole<HTMLInputElement>("textbox", {
        name: "Search roles",
      }),
      { target: { value: "app" } }
    );

    expect(routerMocks.navigate).toHaveBeenLastCalledWith(
      expect.objectContaining({ ignoreBlocker: true })
    );
    await act(async () => {
      routerMocks.navigationResolves[0]?.();
      await Promise.resolve();
    });
  });

  it("handles a rejected search and restores the settled URL query", async () => {
    routerMocks.q = "settled";
    routerMocks.location.searchStr = "?q=settled";
    render(<SearchHarness />);
    const input = screen.getByRole<HTMLInputElement>("textbox", {
      name: "Search roles",
    });

    fireEvent.change(input, { target: { value: "rejected" } });
    const error = new Error("Navigation failed");
    routerMocks.navigationRejects.at(-1)?.(error);

    await waitFor(() => expect(input.value).toBe("settled"));
    expect(navigationErrorMocks.handleNavigationError).toHaveBeenCalledWith(
      error,
      { area: "url-table-search" }
    );
  });

  it("does not let a stale failure overwrite a newer equal-valued edit", async () => {
    routerMocks.q = "settled";
    routerMocks.location.searchStr = "?q=settled";
    render(<SearchHarness />);
    const input = screen.getByRole<HTMLInputElement>("textbox", {
      name: "Search roles",
    });

    fireEvent.change(input, { target: { value: "same" } });
    fireEvent.change(input, { target: { value: "newer" } });
    fireEvent.change(input, { target: { value: "same" } });

    const staleError = new Error("Stale failure");
    await act(async () => {
      routerMocks.navigationRejects[0]?.(staleError);
      await Promise.resolve();
      await Promise.resolve();
    });
    const valueAfterStaleFailure = input.value;
    await act(async () => {
      routerMocks.navigationResolves[1]?.();
      routerMocks.navigationResolves[2]?.();
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(navigationErrorMocks.handleNavigationError).toHaveBeenCalledWith(
        staleError,
        { area: "url-table-search" }
      )
    );
    expect(valueAfterStaleFailure).toBe("same");
  });

  it("rolls the latest failure back to the latest settled URL query", async () => {
    routerMocks.q = "original";
    routerMocks.location.searchStr = "?q=original";
    const { rerender } = render(<SearchHarness />);
    const input = screen.getByRole<HTMLInputElement>("textbox", {
      name: "Search roles",
    });

    fireEvent.change(input, { target: { value: "first" } });
    fireEvent.change(input, { target: { value: "second" } });

    routerMocks.q = "first";
    routerMocks.location.searchStr = "?q=first";
    rerender(<SearchHarness />);
    routerMocks.navigationResolves[0]?.();
    routerMocks.navigationRejects[1]?.(new Error("Latest failure"));

    await waitFor(() => expect(input.value).toBe("first"));
  });

  it("syncs a history change after the pending navigation resolves", async () => {
    routerMocks.q = "initial";
    routerMocks.location.searchStr = "?q=initial";
    const { rerender } = render(<SearchHarness />);
    const input = screen.getByRole<HTMLInputElement>("textbox", {
      name: "Search roles",
    });

    fireEvent.change(input, { target: { value: "pending" } });
    routerMocks.q = "history";
    routerMocks.location.searchStr = "?q=history";
    rerender(<SearchHarness />);
    await act(async () => {
      routerMocks.navigationResolves[0]?.();
      await Promise.resolve();
    });

    expect(input.value).toBe("history");
  });

  it("syncs a settled URL query after it changes and returns", async () => {
    routerMocks.q = "initial";
    routerMocks.location.searchStr = "?q=initial";
    const { rerender } = render(<SearchHarness />);
    const input = screen.getByRole<HTMLInputElement>("textbox", {
      name: "Search roles",
    });

    fireEvent.change(input, { target: { value: "pending" } });
    routerMocks.q = "history";
    routerMocks.location.searchStr = "?q=history";
    rerender(<SearchHarness />);
    routerMocks.q = "initial";
    routerMocks.location.searchStr = "?q=initial";
    rerender(<SearchHarness />);
    await act(async () => {
      routerMocks.navigationResolves[0]?.();
      await Promise.resolve();
    });

    expect(input.value).toBe("initial");
  });

  it("keeps the input editable while URL navigation is pending", async () => {
    const user = userEvent.setup();
    render(<SearchHarness />);

    const input = screen.getByRole<HTMLInputElement>("textbox", {
      name: "Search roles",
    });

    await user.type(input, "abc");
    expect(input.value).toBe("abc");

    await user.keyboard("{Backspace}{Backspace}{Backspace}");
    expect(input.value).toBe("");
    expect(routerMocks.navigate).toHaveBeenCalled();

    for (const resolveNavigation of routerMocks.navigationResolves) {
      resolveNavigation();
    }
    await Promise.resolve();
  });
});
