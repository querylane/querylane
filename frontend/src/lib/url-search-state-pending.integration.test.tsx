import { beforeEach, describe, expect, it, rs } from "@rstest/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Input } from "@/components/ui/input";
import { useUrlTableSearch } from "@/lib/url-search-state";

const routerMocks = rs.hoisted(() => ({
  location: { hash: "", pathname: "/instances/prod/roles", searchStr: "" },
  navigate: rs.fn(),
  navigationRejects: [] as Array<(reason?: unknown) => void>,
  navigationResolves: [] as Array<() => void>,
  q: "",
}));

const navigationErrorMocks = rs.hoisted(() => ({
  handleNavigationError: rs.fn(),
}));

rs.mock("@tanstack/react-router", () => ({
  useLocation: () => routerMocks.location,
  useNavigate: () => routerMocks.navigate,
  useSearch: () => routerMocks.q,
}));

rs.mock("@/lib/navigation-errors", () => navigationErrorMocks);

function SearchHarness() {
  const [query, setQuery] = useUrlTableSearch("/instances/$instanceId/roles");
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
});
