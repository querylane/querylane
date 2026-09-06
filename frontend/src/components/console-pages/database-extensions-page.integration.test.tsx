import { create } from "@bufbuild/protobuf";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  rs,
  test,
} from "@rstest/core";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BackendDatabaseExtensionsPage } from "@/components/console-pages/database-extensions-page";
import {
  ExtensionSchema,
  type ListExtensionsResponse,
  ListExtensionsResponseSchema,
} from "@/protogen/querylane/console/v1alpha1/extension_pb";

interface QueryState<T> {
  data?: T;
  error?: unknown;
  isFetching?: boolean;
  isPending?: boolean;
  refetch?: () => Promise<unknown>;
}

const state = rs.hoisted(() => ({
  extensionsQuery: {} as QueryState<ListExtensionsResponse>,
  tableSearch: "",
  updateTableSearch: rs.fn(),
}));
const INSTALL_EXTENSION_BUTTON_NAME = /install extension/i;
const PG_TRGM_BUTTON_NAME = /^pg_trgm$/;
const AMCHECK_BUTTON_NAME = /^amcheck$/;
const INSTALLED_PG_TRGM_TEXT = /Installed · 1\.6/;
const SCHEMA_PUBLIC_TEXT = /schema public/;
const UUID_OSSP_BUTTON_NAME = /^uuid-ossp$/;

rs.mock("@/hooks/api/extension", () => ({
  extensionsForDatabaseQueryInput: ({
    databaseId,
    instanceId,
  }: {
    databaseId: string;
    instanceId: string;
  }) => ({
    orderBy: "installed desc",
    pageSize: 50,
    parent: `instances/${instanceId}/databases/${databaseId}`,
  }),
  useListAllExtensionsQuery: () => ({
    data: state.extensionsQuery.data,
    error: state.extensionsQuery.error ?? null,
    isFetching: state.extensionsQuery.isFetching ?? false,
    isPending: state.extensionsQuery.isPending ?? false,
    refetch: state.extensionsQuery.refetch ?? rs.fn(async () => undefined),
  }),
}));

rs.mock("@/lib/url-search-state", () => ({
  useUrlTableSearch: () =>
    [state.tableSearch, state.updateTableSearch] as const,
}));

function extensionsResponse() {
  return create(ListExtensionsResponseSchema, {
    extensions: [
      create(ExtensionSchema, {
        comment:
          "Trigram matching — fuzzy text search and fast LIKE/ILIKE indexing",
        defaultVersion: "1.6",
        displayName: "pg_trgm",
        installed: true,
        installedVersion: "1.6",
        name: "instances/prod/databases/customer-events/extensions/pg_trgm",
        schema: "public",
      }),
      create(ExtensionSchema, {
        comment: "PL/pgSQL procedural language",
        defaultVersion: "1.0",
        displayName: "plpgsql",
        installed: true,
        installedVersion: "1.0",
        name: "instances/prod/databases/customer-events/extensions/plpgsql",
        schema: "pg_catalog",
      }),
      create(ExtensionSchema, {
        comment: "Generate universally unique identifiers (v1, v3, v4, v5)",
        defaultVersion: "1.1",
        displayName: "uuid-ossp",
        installed: false,
        name: "instances/prod/databases/customer-events/extensions/uuid-ossp",
      }),
      create(ExtensionSchema, {
        comment: "functions for verifying relation integrity",
        defaultVersion: "1.4",
        displayName: "amcheck",
        installed: false,
        name: "instances/prod/databases/customer-events/extensions/amcheck",
      }),
    ],
  });
}

function renderPage() {
  render(
    <BackendDatabaseExtensionsPage
      databaseId="customer-events"
      instanceId="prod"
      searchRoute="/instances/$instanceId/databases/$databaseId/extensions"
    />
  );
}

beforeEach(() => {
  state.extensionsQuery = { data: extensionsResponse() };
  state.tableSearch = "";
  state.updateTableSearch = rs.fn();
});

afterEach(() => {
  cleanup();
});

describe("database extensions page", () => {
  test("renders the full inventory as a single table without pagination", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "Extensions" })).toBeTruthy();
    expect(screen.getByRole("table")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: PG_TRGM_BUTTON_NAME })
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: AMCHECK_BUTTON_NAME })
    ).toBeTruthy();
    expect(screen.getByText("4 of 4 extensions")).toBeTruthy();
    expect(screen.getAllByText("Installed").length).toBeGreaterThan(0);
    expect(
      screen.queryByRole("combobox", { name: "Extensions per page" })
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: INSTALL_EXTENSION_BUTTON_NAME })
    ).toBeNull();
  });

  test("filters by status tabs with counts", async () => {
    const user = userEvent.setup();
    renderPage();

    const tabs = screen.getByRole("tablist");
    expect(within(tabs).getByRole("tab", { name: "All 4" })).toBeTruthy();

    await user.click(within(tabs).getByRole("tab", { name: "Available 2" }));

    expect(
      screen.getByRole("button", { name: UUID_OSSP_BUTTON_NAME })
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: PG_TRGM_BUTTON_NAME })
    ).toBeNull();
    expect(screen.getByText("2 of 4 extensions")).toBeTruthy();
  });

  test("filters by curated category without offering fabricated ones", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("combobox", { name: "Category" }));

    expect(
      screen.getAllByRole("option").map((option) => option.textContent)
    ).toEqual(["All categories", "Data types", "Languages", "Search"]);

    await user.click(screen.getByRole("option", { name: "Search" }));

    expect(
      screen.getByRole("button", { name: PG_TRGM_BUTTON_NAME })
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: AMCHECK_BUTTON_NAME })
    ).toBeNull();
  });

  test("restores the table filter from URL search state", () => {
    state.tableSearch = "trgm";
    renderPage();

    const filterInput = screen.getByRole("textbox", {
      name: "Search extensions…",
    }) as HTMLInputElement;
    expect(filterInput.value).toBe("trgm");
    expect(
      screen.getByRole("button", { name: PG_TRGM_BUTTON_NAME })
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: UUID_OSSP_BUTTON_NAME })
    ).toBeNull();
  });

  test("writes filter changes to URL search state", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(
      screen.getByRole("textbox", { name: "Search extensions…" }),
      "p"
    );

    expect(state.updateTableSearch).toHaveBeenCalledWith("p");
  });

  test("shows one empty-state message when filters match nothing", () => {
    state.tableSearch = "missing";
    renderPage();

    expect(screen.getAllByText("No extensions match")).toHaveLength(1);
    expect(screen.queryByRole("table")).toBeNull();
  });

  test("opens an installed curated drawer with docs and no mutation actions", async () => {
    const user = userEvent.setup();
    renderPage();

    const trigger = screen.getByRole("button", { name: PG_TRGM_BUTTON_NAME });
    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    await user.click(trigger);

    const drawer = screen.getByRole("dialog", { name: "pg_trgm details" });
    expect(drawer.getAttribute("data-slot")).toBe("sheet-content");
    expect(within(drawer).getByText(INSTALLED_PG_TRGM_TEXT)).toBeTruthy();
    expect(within(drawer).getByText(SCHEMA_PUBLIC_TEXT)).toBeTruthy();
    expect(within(drawer).getByText("Try it")).toBeTruthy();
    expect(within(drawer).getByText("What it is")).toBeTruthy();

    await user.click(
      within(drawer).getByRole("button", { name: "What it gives you" })
    );
    expect(within(drawer).getByText("gin_trgm_ops")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: INSTALL_EXTENSION_BUTTON_NAME })
    ).toBeNull();

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(
      screen.queryByRole("dialog", { name: "pg_trgm details" })
    ).toBeNull();
  });

  test("shows derived install SQL for available extensions", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(
      screen.getByRole("button", { name: UUID_OSSP_BUTTON_NAME })
    );

    const drawer = screen.getByRole("dialog", { name: "uuid-ossp details" });
    expect(
      within(drawer).getByText("Not installed in this database")
    ).toBeTruthy();
    expect(
      within(drawer).getByText(
        "Requires a superuser connection; Querylane only reads what is there."
      )
    ).toBeTruthy();
    expect(
      within(drawer).getAllByRole("button", { name: "Copy SQL" })
    ).toHaveLength(2);
  });

  test("renders non-curated drawers from server data only", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: AMCHECK_BUTTON_NAME }));

    const drawer = screen.getByRole("dialog", { name: "amcheck details" });
    expect(
      within(drawer).getByText("functions for verifying relation integrity")
    ).toBeTruthy();
    expect(
      within(drawer).getByText("Not installed in this database")
    ).toBeTruthy();
    expect(within(drawer).queryByText("What it gives you")).toBeNull();
    expect(within(drawer).queryByText("Try it")).toBeNull();
    expect(within(drawer).getByText("Details")).toBeTruthy();
    expect(within(drawer).getByText("Latest")).toBeTruthy();
    expect(
      within(drawer).getAllByRole("button", { name: "Copy SQL" })
    ).toHaveLength(1);
  });
});
