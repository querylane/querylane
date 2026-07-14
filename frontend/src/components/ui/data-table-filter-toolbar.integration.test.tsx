import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { DataTableFilterToolbar } from "@/components/ui/data-table-filter-toolbar";

afterEach(() => {
  cleanup();
});

function FilterToolbarFixture({
  onClearAllCall = () => undefined,
}: {
  onClearAllCall?: () => void;
}) {
  const [search, setSearch] = useState("orders");
  const [kinds, setKinds] = useState(["view"]);
  const [owners, setOwners] = useState<string[]>([]);
  const [schemas, setSchemas] = useState(["public"]);
  const [statuses, setStatuses] = useState<string[]>([]);

  function handleClearAll() {
    onClearAllCall();
    setSearch("");
    setKinds([]);
    setOwners([]);
    setSchemas([]);
    setStatuses([]);
  }

  return (
    <DataTableFilterToolbar
      dataSlot="test-filter-toolbar"
      facets={[
        {
          label: "Status",
          onChange: setStatuses,
          options: [
            { label: "Active", value: "active" },
            { label: "Paused", value: "paused" },
          ],
          selected: statuses,
          singleSelect: true,
        },
        {
          label: "Kind",
          onChange: setKinds,
          options: [
            { label: "Table", value: "table" },
            { label: "View", value: "view" },
          ],
          selected: kinds,
        },
        {
          label: "Schema",
          onChange: setSchemas,
          options: [],
          selected: schemas,
        },
        {
          label: "Owner",
          onChange: setOwners,
          options: [{ label: "postgres", value: "postgres" }],
          selected: owners,
        },
      ]}
      onClearAll={handleClearAll}
      onSearchChange={setSearch}
      searchPlaceholder="Search objects..."
      searchValue={search}
    />
  );
}

describe("data table filter toolbar", () => {
  it("keeps a default accessible search label when no placeholder is provided", () => {
    render(
      <DataTableFilterToolbar
        facets={[]}
        onClearAll={() => undefined}
        onSearchChange={() => undefined}
        searchValue=""
      />
    );

    const search = screen.getByRole("textbox", { name: "Filter..." });
    expect(search.getAttribute("placeholder")).toBe("Filter...");
  });

  it("renders search first, ordered useful facets, and an active sparse facet", () => {
    render(<FilterToolbarFixture />);

    const toolbar = document.querySelector(
      '[data-slot="test-filter-toolbar"]'
    );
    if (!(toolbar instanceof HTMLElement)) {
      throw new Error("Expected filter toolbar");
    }

    expect(
      within(toolbar)
        .getAllByRole("button")
        .map((button) => button.textContent)
    ).toEqual(["Status", "Kind1View", "Schema1Unavailable", "Clear all"]);
    const search = within(toolbar).getByRole("textbox", {
      name: "Search objects...",
    });
    expect((search as HTMLInputElement).value).toBe("orders");
    expect(
      search.compareDocumentPosition(
        within(toolbar).getByRole("button", { name: "Status" })
      ) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(within(toolbar).queryByRole("button", { name: "Owner" })).toBeNull();
  });

  it("clears search and every facet without owning pagination state", async () => {
    const user = userEvent.setup();
    const onClearAllCall = vi.fn();
    render(<FilterToolbarFixture onClearAllCall={onClearAllCall} />);

    await user.click(screen.getByRole("button", { name: "Clear all" }));

    expect(onClearAllCall).toHaveBeenCalledTimes(1);
    const search = screen.getByRole("textbox", {
      name: "Search objects...",
    }) as HTMLInputElement;
    expect(search.value).toBe("");
    expect(document.activeElement).toBe(search);
    expect(screen.queryByRole("button", { name: /Kind/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Schema/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Clear all" })).toBeNull();
  });

  it("focuses search before an active sparse facet disappears on click", async () => {
    const user = userEvent.setup();
    render(<FilterToolbarFixture />);

    await user.click(screen.getByRole("button", { name: /Schema.*Unavailable/ }));
    await user.click(screen.getByRole("option", { name: "Clear filter" }));

    const search = screen.getByRole("textbox", {
      name: "Search objects...",
    });
    expect(screen.queryByRole("button", { name: /Schema/ })).toBeNull();
    expect(document.activeElement).toBe(search);
  });

  it("focuses search before an active sparse facet disappears by keyboard", async () => {
    const user = userEvent.setup();
    render(<FilterToolbarFixture />);

    const schema = screen.getByRole("button", { name: /Schema.*Unavailable/ });
    schema.focus();
    await user.keyboard("{Enter}");
    // A sparse facet (no selectable options) omits the search box, so the
    // command list takes focus and the auto-highlighted "Clear filter" item is
    // what a subsequent Enter acts on.
    expect(await screen.findByRole("option", { name: "Clear filter" })).toBeTruthy();
    await user.keyboard("{Enter}");

    const search = screen.getByRole("textbox", {
      name: "Search objects...",
    });
    expect(screen.queryByRole("button", { name: /Schema/ })).toBeNull();
    expect(document.activeElement).toBe(search);
  });

  it("clears a search-only toolbar and returns focus to search", async () => {
    const user = userEvent.setup();

    function SearchOnlyToolbar() {
      const [search, setSearch] = useState("orders");
      return (
        <DataTableFilterToolbar
          facets={[]}
          onClearAll={() => setSearch("")}
          onSearchChange={setSearch}
          searchPlaceholder="Search objects..."
          searchValue={search}
        />
      );
    }

    render(<SearchOnlyToolbar />);

    await user.click(screen.getByRole("button", { name: "Clear all" }));

    const search = screen.getByRole("textbox", {
      name: "Search objects...",
    }) as HTMLInputElement;
    expect(search.value).toBe("");
    expect(document.activeElement).toBe(search);
  });
});
