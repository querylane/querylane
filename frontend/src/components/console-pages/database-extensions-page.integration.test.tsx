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
