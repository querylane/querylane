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
        comment: "text similarity measurement and index searching",
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
        comment: "generate universally unique identifiers",
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
    expect(screen.getByText("pg_trgm")).toBeTruthy();
    expect(screen.getByText("uuid-ossp")).toBeTruthy();
    expect(screen.getAllByText("Installed").length).toBeGreaterThan(0);
    expect(screen.getByText("Available")).toBeTruthy();
    expect(screen.getByText("public")).toBeTruthy();
    expect(screen.getAllByText("1.6")).toHaveLength(2);
    expect(
      screen.getByText("generate universally unique identifiers")
    ).toBeTruthy();
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

  test("places extension search on the left beside status and schema filters", () => {
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
        .getAllByRole("button")
        .map((button) => button.textContent)
    ).toEqual(["Status", "Schema"]);
  });

  test("filters extensions by status and schema facets", async () => {
    const user = userEvent.setup();
    render(
      <BackendDatabaseExtensionsPage
        databaseId="customer-events"
        instanceId="prod"
      />
    );

    await user.click(screen.getByRole("button", { name: "Status" }));
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

    await user.click(screen.getByRole("button", { name: "Schema" }));
    await user.click(screen.getByRole("option", { name: "pg_catalog" }));

    expect(screen.getByText("plpgsql")).toBeTruthy();
    expect(screen.queryByText("pg_trgm")).toBeNull();
    expect(screen.queryByText("uuid-ossp")).toBeNull();
  });
});
