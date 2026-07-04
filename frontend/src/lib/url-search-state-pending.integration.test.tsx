import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Input } from "@/components/ui/input";
import { useUrlTableSearch } from "@/lib/url-search-state";

const routerMocks = vi.hoisted(() => ({
  location: { hash: "", pathname: "/instances/prod/roles", searchStr: "" },
  navigate: vi.fn(),
  navigationResolves: [] as Array<() => void>,
  q: "",
}));

vi.mock("@tanstack/react-router", () => ({
  useLocation: () => routerMocks.location,
  useNavigate: () => routerMocks.navigate,
  useSearch: () => routerMocks.q,
}));

function SearchHarness() {
  const [query, setQuery] = useUrlTableSearch();
  return (
    <Input
      aria-label="Search roles"
      onChange={(event) => {
        setQuery(event.target.value).catch((error: unknown) => {
          throw error;
        });
      }}
      value={query}
    />
  );
}

describe("useUrlTableSearch", () => {
  beforeEach(() => {
    routerMocks.navigate.mockClear();
    routerMocks.navigationResolves = [];
    routerMocks.navigate.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          routerMocks.navigationResolves.push(resolve);
        })
    );
    routerMocks.q = "";
    routerMocks.location.searchStr = "";
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
