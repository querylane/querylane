import { create } from "@bufbuild/protobuf";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
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

const state = vi.hoisted(() => ({
  extensionsQuery: {} as QueryState<ListExtensionsResponse>,
  tableSearch: "",
  updateTableSearch: vi.fn(),
}));
const INSTALL_EXTENSION_BUTTON_NAME = /install extension/i;
const OPEN_IN_WORKBENCH_BUTTON_NAME = /open in sql workbench/i;
const PG_TRGM_EXTENSION_CARD_NAME = /pg_trgm/i;
const UUID_OSSP_EXTENSION_CARD_NAME = /uuid-ossp/i;
const PG_TRGM_EXTENSION_KEY = "pg_trgm";

vi.mock("@/hooks/api/extension", () => ({
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
    refetch: state.extensionsQuery.refetch ?? vi.fn(async () => undefined),
  }),
}));

vi.mock("@/lib/url-search-state", () => ({
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
        displayName: PG_TRGM_EXTENSION_KEY,
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
    ],
  });
}

beforeEach(() => {
  state.extensionsQuery = { data: extensionsResponse() };
  state.tableSearch = "";
  state.updateTableSearch = vi.fn();
});

afterEach(() => {
  cleanup();
});

describe("database extensions page", () => {
  test("renders installed and available extensions", () => {
    render(
      <BackendDatabaseExtensionsPage
        databaseId="customer-events"
        instanceId="prod"
      />
    );

    expect(screen.getByRole("heading", { name: "Extensions" })).toBeTruthy();
    expect(
      screen.getByText(
        "Extensions are installed per database. Available means the server exposes the extension files, but this database has not installed it."
      )
    ).toBeTruthy();
    expect(screen.queryByText("Extension inventory")).toBeNull();
    expect(
      screen.queryByRole("button", { name: INSTALL_EXTENSION_BUTTON_NAME })
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: OPEN_IN_WORKBENCH_BUTTON_NAME })
    ).toBeNull();
    expect(
      screen.getByText(
        "2 installed · 1 available on this server; installation requires a superuser connection; Querylane only reads what is there"
      )
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: PG_TRGM_EXTENSION_CARD_NAME })
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: UUID_OSSP_EXTENSION_CARD_NAME })
    ).toBeTruthy();
    expect(screen.getAllByText("Installed").length).toBeGreaterThan(0);
    expect(screen.getByText("Available")).toBeTruthy();
    expect(screen.getByText("1.6")).toBeTruthy();
    expect(
      screen.getByText(
        "Generate universally unique identifiers (v1, v3, v4, v5)"
      )
    ).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  test("shows one empty-state message when filters match nothing", () => {
    state.tableSearch = "missing";
    render(
      <BackendDatabaseExtensionsPage
        databaseId="customer-events"
        instanceId="prod"
      />
    );

    expect(screen.getAllByText("No extensions match")).toHaveLength(1);
  });

  test("restores the table filter from URL search state", () => {
    state.tableSearch = "trgm";

    render(
      <BackendDatabaseExtensionsPage
        databaseId="customer-events"
        instanceId="prod"
      />
    );

    const filterInput = screen.getByRole("textbox", {
      name: "Search extensions...",
    }) as HTMLInputElement;
    expect(filterInput.value).toBe("trgm");
    expect(screen.getByText("pg_trgm")).toBeTruthy();
    expect(screen.queryByText("uuid-ossp")).toBeNull();
  });

  test("writes filter changes to URL search state", async () => {
    const user = userEvent.setup();
    render(
      <BackendDatabaseExtensionsPage
        databaseId="customer-events"
        instanceId="prod"
      />
    );

    await user.type(
      screen.getByRole("textbox", { name: "Search extensions..." }),
      "p"
    );

    expect(state.updateTableSearch).toHaveBeenCalledWith("p");
  });

  test("places extension search on the left beside redesign filters", () => {
    render(
      <BackendDatabaseExtensionsPage
        databaseId="customer-events"
        instanceId="prod"
      />
    );

    const search = screen.getByRole("textbox", {
      name: "Search extensions...",
    });
    const filterBar = search.closest('[data-slot="extension-filter-bar"]');
    if (!(filterBar instanceof HTMLElement)) {
      throw new Error("Missing extension filter bar");
    }

    expect(filterBar.className).toContain("justify-start");
    expect(
      within(filterBar)
        .getAllByRole("combobox")
        .map((button) => button.textContent?.replace(/▼/g, ""))
    ).toEqual([
      "Status: all",
      "Scope: all",
      "Category: all",
      "Source: all",
      "Per page 6",
    ]);
  });

  test("filters extensions by status and source facets", async () => {
    const user = userEvent.setup();
    render(
      <BackendDatabaseExtensionsPage
        databaseId="customer-events"
        instanceId="prod"
      />
    );

    await user.click(screen.getByRole("combobox", { name: "Status" }));
    await user.click(screen.getByRole("option", { name: "Available" }));

    expect(screen.getByText("uuid-ossp")).toBeTruthy();
    expect(screen.queryByText("pg_trgm")).toBeNull();
    expect(screen.queryByText("plpgsql")).toBeNull();

    cleanup();
    render(
      <BackendDatabaseExtensionsPage
        databaseId="customer-events"
        instanceId="prod"
      />
    );

    await user.click(screen.getByRole("combobox", { name: "Source" }));
    await user.click(screen.getByRole("option", { name: "Core contrib" }));

    expect(screen.getByText("pg_trgm")).toBeTruthy();
    expect(screen.getByText("uuid-ossp")).toBeTruthy();
    expect(screen.queryByText("plpgsql")).toBeNull();
  });
  test("opens extension explanation drawer without mutation actions", async () => {
    const user = userEvent.setup();
    render(
      <BackendDatabaseExtensionsPage
        databaseId="customer-events"
        instanceId="prod"
      />
    );

    await user.click(
      screen.getByRole("button", { name: PG_TRGM_EXTENSION_CARD_NAME })
    );

    const drawer = screen.getByRole("dialog", { name: "pg_trgm details" });
    expect(drawer.getAttribute("data-slot")).toBe("sheet-content");
    expect(within(drawer).getByText("What it gives you")).toBeTruthy();
    expect(within(drawer).getByText("Try it")).toBeTruthy();
    expect(within(drawer).getByText("Schema")).toBeTruthy();
    expect(within(drawer).getByText("public")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: INSTALL_EXTENSION_BUTTON_NAME })
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: OPEN_IN_WORKBENCH_BUTTON_NAME })
    ).toBeNull();

    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(
      screen.queryByRole("dialog", { name: "pg_trgm details" })
    ).toBeNull();
  });

  test("renders available install SQL with the shared code block", async () => {
    const user = userEvent.setup();
    render(
      <BackendDatabaseExtensionsPage
        databaseId="customer-events"
        instanceId="prod"
      />
    );

    await user.click(
      screen.getByRole("button", { name: UUID_OSSP_EXTENSION_CARD_NAME })
    );

    const drawer = screen.getByRole("dialog", { name: "uuid-ossp details" });
    expect(
      within(drawer).getByText("A superuser can install it with:")
    ).toBeTruthy();
    expect(
      within(drawer).getAllByRole("button", { name: "Copy SQL" })
    ).toHaveLength(2);
  });

  test("marks extension cards as dialog triggers", async () => {
    const user = userEvent.setup();
    render(
      <BackendDatabaseExtensionsPage
        databaseId="customer-events"
        instanceId="prod"
      />
    );

    const card = screen.getByRole("button", {
      name: PG_TRGM_EXTENSION_CARD_NAME,
    });
    expect(card.getAttribute("aria-haspopup")).toBe("dialog");
    expect(card.getAttribute("aria-expanded")).toBe("false");

    await user.click(card);

    expect(card.getAttribute("aria-expanded")).toBe("true");
  });
});
