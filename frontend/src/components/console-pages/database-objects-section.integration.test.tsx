import { create } from "@bufbuild/protobuf";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OtherDatabaseObject } from "@/components/console-pages/database-object-categories";
import {
  DatabaseObjectsPanel,
  DatabaseObjectsSection,
} from "@/components/console-pages/database-objects-section";
import { ExtensionSchema } from "@/protogen/querylane/console/v1alpha1/extension_pb";

const otherObjectsQuery = vi.hoisted(() => ({
  data: {},
  error: null,
  isLoading: false,
  refetch: vi.fn(() => Promise.resolve()),
}));

const browseQuery = vi.hoisted(() => ({
  data: { pages: [{ hasMore: false, objects: [] }] } as {
    pages: { hasMore: boolean; objects: unknown[] }[];
  },
  error: null,
  fetchNextPage: vi.fn(),
  hasNextPage: false,
  isFetchingNextPage: false,
  isLoading: false,
  refetch: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/components/console-pages/other-database-objects-query", () => ({
  useOtherDatabaseObjectsSummaryQuery: () => otherObjectsQuery,
  useOtherObjectsBrowseQuery: () => browseQuery,
}));

const objects: OtherDatabaseObject[] = [
  {
    badge: "ENUM",
    category: "types",
    detail: "",
    name: "shipping.shipment_status",
    sortKey: "shipping.shipment_status",
    summary: "booked, delivered",
  },
  {
    badge: "DOMAIN",
    category: "types",
    detail: "numeric CHECK (VALUE > 0)",
    name: "shipping.weight_class",
    sortKey: "shipping.weight_class",
    summary: "numeric domain",
  },
  {
    badge: "FUNCTION",
    category: "routines",
    detail: "",
    name: "shipping.route_eta(leg_id bigint)",
    sortKey: "shipping.route_eta",
    summary: "interval · plpgsql · stable",
  },
  {
    badge: "SEQUENCE",
    category: "sequences",
    detail: "",
    name: "shipping.shipment_id_seq",
    sortKey: "shipping.shipment_id_seq",
    summary: "last 42 · increment 1 · max 9223372036854775807",
  },
  {
    badge: "pg_cron",
    category: "cronJobs",
    detail: "CALL refresh()",
    name: "refresh",
    sortKey: "refresh",
    status: "ok",
    summary: "0 3 * * * · postgres · app",
  },
];

function summaryOf(
  items: OtherDatabaseObject[],
  totals: Partial<Record<OtherDatabaseObject["category"], number>> = {}
) {
  const summary: Record<
    string,
    { objects: OtherDatabaseObject[]; total: number }
  > = {};
  for (const object of items) {
    const entry = summary[object.category] ?? { objects: [], total: 0 };
    entry.objects.push(object);
    entry.total = totals[object.category] ?? entry.objects.length;
    summary[object.category] = entry;
  }
  return summary;
}

const extensions = [
  create(ExtensionSchema, {
    comment: "cryptographic functions",
    displayName: "pgcrypto",
    installed: true,
    installedVersion: "1.3",
    name: "instances/prod/databases/app/extensions/pgcrypto",
  }),
  create(ExtensionSchema, {
    comment: "not installed, only available",
    displayName: "postgis",
    installed: false,
    name: "instances/prod/databases/app/extensions/postgis",
  }),
];

const params = { databaseId: "app", instanceId: "prod" };
const VIEW_ALL_RE = /View all/;

function sequenceObject(index: number): OtherDatabaseObject {
  return {
    badge: "SEQUENCE",
    category: "sequences",
    detail: "",
    name: `shipping.seq_${index}`,
    sortKey: `shipping.seq_${index}`,
    summary: `last ${index} · increment 1`,
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("DatabaseObjectsSection", () => {
  it("keeps the extensions card even when the database has no other objects", () => {
    render(
      <DatabaseObjectsSection
        databaseId="app"
        extensions={extensions}
        extensionsPending={false}
        instanceId="prod"
      />
    );

    expect(screen.getByText("Database objects")).toBeTruthy();
    expect(screen.getByText("pgcrypto")).toBeTruthy();
    expect(screen.queryByText("postgis")).toBeNull();
  });
});

describe("DatabaseObjectsPanel", () => {
  it("renders one card per present category with kind-specific rows", () => {
    render(
      <DatabaseObjectsPanel
        extensions={extensions}
        extensionsPending={false}
        isLoading={false}
        params={params}
        summary={summaryOf(objects)}
      />
    );

    // Extensions card: installed extensions with versions, available-only ones hidden.
    expect(screen.getByText("pgcrypto")).toBeTruthy();
    expect(screen.getByText("1.3")).toBeTruthy();
    expect(screen.queryByText("postgis")).toBeNull();

    // Routines render as signatures with return type and language metadata.
    expect(screen.getByText("Routines")).toBeTruthy();
    expect(screen.getByText("route_eta")).toBeTruthy();
    expect(screen.getByText("(leg_id bigint)")).toBeTruthy();
    expect(screen.getByText("→ interval")).toBeTruthy();
    expect(screen.getByText("plpgsql · stable")).toBeTruthy();

    // All categories are visible at once — no tabs to switch through.
    expect(screen.getByText("Types")).toBeTruthy();
    expect(screen.getByText("shipment_status")).toBeTruthy();
    expect(screen.getByText("— booked, delivered")).toBeTruthy();
    expect(screen.getByText("ENUM")).toBeTruthy();
    expect(screen.getByText("shipment_id_seq")).toBeTruthy();
    expect(screen.getByText("last 42")).toBeTruthy();
    expect(screen.getByText("refresh")).toBeTruthy();
    expect(screen.getByText("— CALL refresh()")).toBeTruthy();
    expect(screen.getByText("0 3 * * *")).toBeTruthy();

    // Absent categories get no card.
    expect(screen.queryByText("Event triggers")).toBeNull();
    expect(screen.queryByText("FDW servers")).toBeNull();

    // Nothing overflows, so no card offers a View-all affordance.
    expect(screen.queryByRole("button", { name: VIEW_ALL_RE })).toBeNull();
  });

  it("shows totals beyond the visible rows and opens the browse dialog", async () => {
    const user = userEvent.setup();
    const topFive = Array.from({ length: 5 }, (_, index) =>
      sequenceObject(index)
    );
    browseQuery.data = {
      pages: [
        {
          hasMore: false,
          objects: Array.from({ length: 8 }, (_, index) =>
            sequenceObject(index)
          ),
        },
      ],
    };
    render(
      <DatabaseObjectsPanel
        extensions={[]}
        extensionsPending={false}
        isLoading={false}
        params={params}
        summary={summaryOf(topFive, { sequences: 1234 })}
      />
    );

    const card = screen
      .getByText("Sequences")
      .closest("[data-slot=card]") as HTMLElement;
    // The card itself stays bounded: five rows, an exact total, no expansion.
    expect(within(card).getByText("1234")).toBeTruthy();
    expect(within(card).getByText("seq_0")).toBeTruthy();
    expect(within(card).queryByText("seq_7")).toBeNull();

    await user.click(
      within(card).getByRole("button", { name: "View all 1234 sequences" })
    );

    const dialog = screen.getByRole("dialog", { name: "Sequences" });
    expect(
      within(dialog).getByText("1234 objects in this database")
    ).toBeTruthy();
    expect(
      within(dialog).getByRole("textbox", {
        name: "Search sequences by name",
      })
    ).toBeTruthy();
    expect(within(dialog).getByText("seq_7")).toBeTruthy();
  });

  it("collapses long extension lists behind the View-all dialog", async () => {
    const user = userEvent.setup();
    const manyExtensions = Array.from({ length: 7 }, (_, index) =>
      create(ExtensionSchema, {
        displayName: `ext_${index}`,
        installed: true,
        installedVersion: "1.0",
        name: `instances/prod/databases/app/extensions/ext_${index}`,
      })
    );
    render(
      <DatabaseObjectsPanel
        extensions={manyExtensions}
        extensionsPending={false}
        isLoading={false}
        params={params}
        summary={{}}
      />
    );

    expect(screen.getByText("ext_0")).toBeTruthy();
    expect(screen.queryByText("ext_6")).toBeNull();

    await user.click(
      screen.getByRole("button", { name: "View all 7 extensions" })
    );
    const dialog = screen.getByRole("dialog", { name: "Extensions" });
    expect(within(dialog).getByText("ext_6")).toBeTruthy();

    // Client-side search narrows the already-loaded list.
    await user.type(
      within(dialog).getByRole("textbox", {
        name: "Search extensions by name",
      }),
      "ext_3"
    );
    expect(within(dialog).getByText("ext_3")).toBeTruthy();
    expect(within(dialog).queryByText("ext_6")).toBeNull();
  });

  it("shows the empty extensions message", () => {
    render(
      <DatabaseObjectsPanel
        extensions={[]}
        extensionsPending={false}
        isLoading={false}
        params={params}
        summary={{}}
      />
    );

    expect(
      screen.getByText("No extensions are installed in this database.")
    ).toBeTruthy();
  });

  it("shows loading and retryable error states", async () => {
    const onRetry = vi.fn(() => Promise.resolve());
    const user = userEvent.setup();
    const { rerender } = render(
      <DatabaseObjectsPanel
        extensions={[]}
        extensionsPending={false}
        isLoading={true}
        params={params}
        summary={{}}
      />
    );

    expect(
      screen.getByRole("status", { name: "Loading other database objects" })
    ).toBeTruthy();

    rerender(
      <DatabaseObjectsPanel
        error={new Error("catalog unavailable")}
        extensions={[]}
        extensionsPending={false}
        isLoading={false}
        onRetry={onRetry}
        params={params}
        summary={{}}
      />
    );
    expect(
      screen.getByText("Failed to load other database objects.")
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
