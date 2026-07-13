import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type OtherDatabaseObject,
  OtherDatabaseObjectsPanel,
} from "@/features/data-explorer/other-database-objects-section";

const shipmentStatusObject: OtherDatabaseObject = {
  badge: "ENUM",
  category: "types",
  definition:
    "CREATE TYPE shipping.shipment_status AS ENUM ('booked', 'in_transit', 'customs_hold', 'delayed', 'delivered', 'cancelled');",
  detail: "Enum values are ordered and can only be added.",
  extra: "used by shipping.shipments.status",
  name: "shipping.shipment_status",
  sortKey: "shipping.shipment_status",
  summary: "booked, in_transit, customs_hold, delayed, delivered, cancelled",
  values: [
    "booked",
    "in_transit",
    "customs_hold",
    "delayed",
    "delivered",
    "cancelled",
  ],
};

const objects: OtherDatabaseObject[] = [
  shipmentStatusObject,
  {
    badge: "DOMAIN",
    category: "types",
    definition:
      "CREATE DOMAIN shipping.weight_class AS numeric CHECK (VALUE > 0 AND VALUE < 100000);",
    detail: "numeric CHECK (VALUE > 0 AND VALUE < 100000)",
    name: "shipping.weight_class",
    sortKey: "shipping.weight_class",
    summary: "numeric domain",
  },
  {
    badge: "icu",
    category: "collations",
    definition:
      "CREATE COLLATION case_insensitive (provider = icu, locale = 'und-u-ks-level2', deterministic = false);",
    detail: "und-u-ks-level2 · nondeterministic",
    name: "case_insensitive",
    sortKey: "case_insensitive",
    summary: "Text sort order",
  },
];

const variantObjects: OtherDatabaseObject[] = [
  ...objects,
  {
    badge: "SEQUENCE",
    category: "sequences",
    definition: "CREATE SEQUENCE shipping.shipment_id_seq;",
    detail: "",
    name: "shipping.shipment_id_seq",
    sortKey: "shipping.shipment_id_seq",
    summary: "last 42 · increment 1 · max 9223372036854775807",
  },
  {
    badge: "PROCEDURE",
    category: "routines",
    definition: "CREATE PROCEDURE shipping.refresh_routes() LANGUAGE plpgsql;",
    detail: "",
    name: "shipping.refresh_routes()",
    sortKey: "shipping.refresh_routes",
    summary: "plpgsql · volatile",
  },
  {
    badge: "postgres_fdw",
    category: "fdwServers",
    definition:
      "CREATE SERVER replica_us FOREIGN DATA WRAPPER postgres_fdw OPTIONS (host 'replica', port '5432');",
    detail: "",
    name: "replica_us",
    sortKey: "replica_us",
    summary: "host=replica · port=5432",
  },
  {
    badge: "PUBLICATION",
    category: "replication",
    definition: "CREATE PUBLICATION pub_shipping FOR TABLE shipping.shipments;",
    detail: "",
    name: "pub_shipping",
    sortKey: "pub_shipping",
    status: "ok",
    summary: "selected tables · insert, update, delete",
  },
  {
    badge: "ON ddl_command_start",
    category: "eventTriggers",
    definition:
      "CREATE EVENT TRIGGER audit_ddl ON ddl_command_start EXECUTE FUNCTION audit.log_ddl();",
    detail: "→ audit.log_ddl()",
    name: "audit_ddl",
    sortKey: "audit_ddl",
    status: "ok",
    summary: "Logs schema changes",
  },
  {
    badge: "pg_cron",
    category: "cronJobs",
    definition:
      "SELECT cron.schedule('refresh', '0 3 * * *', 'CALL refresh()');",
    detail: "CALL refresh()",
    extra: "active",
    name: "refresh",
    sortKey: "refresh",
    status: "ok",
    summary: "0 3 * * * · postgres · app",
  },
  {
    badge: "pg_cron",
    category: "cronJobs",
    definition:
      "SELECT cron.schedule('weekly-refresh', '0 3 * * 1', 'CALL refresh()');",
    detail: "CALL refresh()",
    extra: "active",
    name: "weekly-refresh",
    sortKey: "weekly-refresh",
    status: "ok",
    summary: "0 3 * * 1 · postgres · app",
  },
  {
    badge: "pg_cron",
    category: "cronJobs",
    definition:
      "SELECT cron.schedule('restricted-interval', '*/15 3 * * *', 'CALL refresh()');",
    detail: "CALL refresh()",
    extra: "active",
    name: "restricted-interval",
    sortKey: "restricted-interval",
    status: "ok",
    summary: "*/15 3 * * * · postgres · app",
  },
];

const COLLATIONS_BUTTON_RE = /^Collations 1$/;
const CATEGORY_FILTER_RE = /Category/;
const CATEGORY_TYPES_FILTER_RE = /Category.*Types/;
const CRON_JOBS_BUTTON_RE = /^Jobs · pg_cron 3$/;
const CUSTOM_TYPES_INFO_RE = /Custom enums, composites, domains, and ranges/i;
const EVENT_TRIGGERS_BUTTON_RE = /^Event triggers 1$/;
const FDW_SERVERS_BUTTON_RE = /^FDW servers 1$/;
const INCREMENT_ONE_RE = /increment 1/;
const INTRO_COPY_RE = /everything that isn’t a relation/i;
const SHIPMENT_STATUS_BUTTON_RE = /shipping\.shipment_status/i;
const ROUTINES_BUTTON_RE = /^Routines 1$/;
const REPLICATION_BUTTON_RE = /^Replication 1$/;
const RESTRICTED_INTERVAL_BUTTON_RE = /restricted-interval/;
const ROUTINES_INFO_RE = /Functions and procedures/;
const ROUTINES_OPTION_RE = /^Routines/;
const SEQUENCES_BUTTON_RE = /^Sequences 1$/;
const TRUNCATED_INVENTORY_RE = /Showing a partial inventory/;
const CRON_JOBS_OPTION_RE = /^Jobs · pg_cron/;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function selectCategory(
  user: ReturnType<typeof userEvent.setup>,
  categoryName: RegExp
) {
  await user.click(screen.getByRole("button", { name: CATEGORY_FILTER_RE }));
  await user.click(screen.getByRole("option", { name: categoryName }));
  await user.keyboard("{Escape}");
}

describe("OtherDatabaseObjectsPanel", () => {
  it("places search before the inline category filter", async () => {
    const user = userEvent.setup();
    render(<OtherDatabaseObjectsPanel isLoading={false} objects={objects} />);

    const toolbar = screen.getByRole("form", {
      name: "Filter other database objects",
    });
    const search = within(toolbar).getByRole("searchbox", {
      name: "Search other database objects",
    });
    const categoryFilter = within(toolbar).getByRole("button", {
      name: CATEGORY_FILTER_RE,
    });

    expect(
      Array.from(toolbar.querySelectorAll("input, button")).slice(0, 2)
    ).toEqual([search, categoryFilter]);

    await selectCategory(user, COLLATIONS_BUTTON_RE);

    expect(screen.getByText("case_insensitive")).toBeTruthy();
    expect(screen.queryByText("shipping.shipment_status")).toBeNull();
  });

  it("lists only categories that contain objects", async () => {
    const user = userEvent.setup();
    render(<OtherDatabaseObjectsPanel isLoading={false} objects={objects} />);

    await user.click(
      screen.getByRole("button", { name: CATEGORY_TYPES_FILTER_RE })
    );

    expect(screen.getByRole("option", { name: "Types 2" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Collations 1" })).toBeTruthy();
    expect(
      screen.queryByRole("option", { name: ROUTINES_OPTION_RE })
    ).toBeNull();
    expect(
      screen.queryByRole("option", { name: CRON_JOBS_OPTION_RE })
    ).toBeNull();
  });

  it("uses placeholders instead of empty categories while loading", () => {
    render(<OtherDatabaseObjectsPanel isLoading={true} objects={[]} />);

    expect(
      screen.getByRole("status", { name: "Loading object filters" })
    ).toBeTruthy();
    expect(
      screen.queryByRole("searchbox", {
        name: "Search other database objects",
      })
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: CATEGORY_FILTER_RE })
    ).toBeNull();
    expect(screen.queryByText(CUSTOM_TYPES_INFO_RE)).toBeNull();
  });

  it("hides category controls when the database has no objects", () => {
    render(<OtherDatabaseObjectsPanel isLoading={false} objects={[]} />);

    expect(
      screen.getByRole("searchbox", {
        name: "Search other database objects",
      })
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: CATEGORY_FILTER_RE })
    ).toBeNull();
    expect(screen.queryByText(ROUTINES_INFO_RE)).toBeNull();
    expect(screen.getByText("None in this database.")).toBeTruthy();
  });

  it("falls back when a selected category is no longer present", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <OtherDatabaseObjectsPanel isLoading={false} objects={objects} />
    );

    await selectCategory(user, COLLATIONS_BUTTON_RE);
    rerender(
      <OtherDatabaseObjectsPanel
        isLoading={false}
        objects={objects.filter((object) => object.category === "types")}
      />
    );

    expect(
      screen.getByRole("button", { name: CATEGORY_TYPES_FILTER_RE })
    ).toBeTruthy();
    expect(screen.getByText("shipping.shipment_status")).toBeTruthy();
    expect(screen.queryByText("Matches exist in other categories.")).toBeNull();
  });

  it("renders the category filter and type cards", () => {
    render(<OtherDatabaseObjectsPanel isLoading={false} objects={objects} />);

    expect(
      screen.getByRole("heading", { name: "Other database objects" })
    ).toBeTruthy();
    expect(screen.getByText(INTRO_COPY_RE)).toBeTruthy();

    expect(
      screen.getByRole("button", { name: CATEGORY_TYPES_FILTER_RE })
    ).toBeTruthy();
    expect(screen.getByText(CUSTOM_TYPES_INFO_RE)).toBeTruthy();
    expect(screen.getByText("shipping.shipment_status")).toBeTruthy();
    expect(screen.getByText("shipping.weight_class")).toBeTruthy();
  });

  it("keeps search result counts and the selected-category state consistent", async () => {
    const user = userEvent.setup();
    render(<OtherDatabaseObjectsPanel isLoading={false} objects={objects} />);

    await user.type(
      screen.getByRole("searchbox", {
        name: "Search other database objects",
      }),
      "case_insensitive"
    );
    await user.click(
      screen.getByRole("button", { name: CATEGORY_TYPES_FILTER_RE })
    );

    expect(screen.getByText("Matches exist in other categories.")).toBeTruthy();
    expect(screen.getByRole("option", { name: "Types 0" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Collations 1" })).toBeTruthy();
  });

  it("guides users when search has no matches in the selected category", async () => {
    const user = userEvent.setup();
    render(
      <OtherDatabaseObjectsPanel isLoading={false} objects={variantObjects} />
    );

    await selectCategory(user, COLLATIONS_BUTTON_RE);
    expect(screen.getByText("case_insensitive")).toBeTruthy();
    expect(screen.queryByText("shipping.shipment_status")).toBeNull();

    await user.type(
      screen.getByRole("searchbox", {
        name: "Search other database objects",
      }),
      "refresh_routes"
    );
    expect(screen.getByText("Matches exist in other categories.")).toBeTruthy();
    expect(
      screen.getByText(
        "Choose a category with matches or clear the category filter."
      )
    ).toBeTruthy();
  });

  it("copies the selected object's SQL", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    const user = userEvent.setup({ writeToClipboard: false });
    vi.stubGlobal("navigator", {
      ...navigator,
      clipboard: { writeText },
    });

    render(<OtherDatabaseObjectsPanel isLoading={false} objects={objects} />);

    const card = screen
      .getByText("shipping.shipment_status")
      .closest("article");
    if (!(card instanceof HTMLElement)) {
      throw new Error("Missing type card");
    }

    await user.click(
      within(card).getByRole("button", { name: SHIPMENT_STATUS_BUTTON_RE })
    );
    await user.click(within(card).getByRole("button", { name: "Copy SQL" }));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(shipmentStatusObject.definition)
    );
  });

  it("renders accurate sequence values and procedure metadata", async () => {
    const user = userEvent.setup();
    render(
      <OtherDatabaseObjectsPanel isLoading={false} objects={variantObjects} />
    );

    await selectCategory(user, SEQUENCES_BUTTON_RE);
    expect(screen.getByText("42")).toBeTruthy();
    expect(screen.getByText("Last value")).toBeTruthy();
    expect(screen.getByText(INCREMENT_ONE_RE)).toBeTruthy();

    await selectCategory(user, ROUTINES_BUTTON_RE);
    const procedureCard = screen
      .getByText("shipping.refresh_routes")
      .closest("article");
    expect(procedureCard?.textContent).toContain("plpgsql");
    expect(procedureCard?.textContent).not.toContain("→ plpgsql");

    await selectCategory(user, FDW_SERVERS_BUTTON_RE);
    expect(screen.getByText("replica_us")).toBeTruthy();
    await selectCategory(user, REPLICATION_BUTTON_RE);
    expect(screen.getByText("pub_shipping")).toBeTruthy();
    await selectCategory(user, EVENT_TRIGGERS_BUTTON_RE);
    expect(screen.getByText("audit_ddl")).toBeTruthy();
    await selectCategory(user, CRON_JOBS_BUTTON_RE);
    expect(screen.getByText("refresh")).toBeTruthy();
    expect(screen.getAllByText("0 3 * * 1")).toHaveLength(2);
    const restrictedCard = screen
      .getByText("restricted-interval")
      .closest("article");
    if (!(restrictedCard instanceof HTMLElement)) {
      throw new Error("Missing restricted interval card");
    }
    expect(
      within(restrictedCard).getByTestId("schedule-description").textContent
    ).toBe("*/15 3 * * *");
    await user.click(
      within(restrictedCard).getByRole("button", {
        name: RESTRICTED_INTERVAL_BUTTON_RE,
      })
    );
    expect(screen.getByText("“*/15 3 * * *”")).toBeTruthy();
  });

  it("preserves enum labels containing commas and shows hidden value counts", () => {
    const values = Array.from({ length: 13 }, (_, index) =>
      index === 2 ? "port, transfer" : `value-${index + 1}`
    );
    render(
      <OtherDatabaseObjectsPanel
        isLoading={false}
        objects={[{ ...shipmentStatusObject, values }]}
      />
    );

    expect(screen.getByText("port, transfer")).toBeTruthy();
    expect(screen.getByText("+1 more")).toBeTruthy();
  });

  it("shows loading and retryable error states", async () => {
    const onRetry = vi.fn(() => Promise.resolve());
    const user = userEvent.setup();
    const { rerender } = render(
      <OtherDatabaseObjectsPanel isLoading={true} objects={[]} />
    );

    expect(
      screen.getByRole("status", { name: "Loading other database objects" })
    ).toBeTruthy();

    rerender(
      <OtherDatabaseObjectsPanel
        error={new Error("catalog unavailable")}
        isLoading={false}
        objects={[]}
        onRetry={onRetry}
      />
    );
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("warns when the database-wide inventory is truncated", () => {
    render(
      <OtherDatabaseObjectsPanel
        isLoading={false}
        isTruncated={true}
        objects={objects}
      />
    );

    expect(screen.getByText(TRUNCATED_INVENTORY_RE)).toBeTruthy();
  });

  it("handles unavailable clipboard access without throwing", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("navigator", { ...navigator, clipboard: undefined });
    render(<OtherDatabaseObjectsPanel isLoading={false} objects={objects} />);

    const card = screen
      .getByText("shipping.shipment_status")
      .closest("article");
    if (!(card instanceof HTMLElement)) {
      throw new Error("Missing type card");
    }
    await user.click(
      within(card).getByRole("button", { name: SHIPMENT_STATUS_BUTTON_RE })
    );
    await user.click(within(card).getByRole("button", { name: "Copy SQL" }));

    expect(screen.getByRole("status").textContent).toBe("Could not copy SQL.");
  });

  it("clears copy feedback after it has been announced", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    const user = userEvent.setup();
    const nativeSetTimeout = globalThis.setTimeout;
    let clearNotice: (() => void) | undefined;
    vi.spyOn(globalThis, "setTimeout").mockImplementation(
      (handler, timeout, ...args) => {
        if (timeout === 2000) {
          clearNotice = () => handler(...args);
          return nativeSetTimeout(() => undefined, 0);
        }
        return nativeSetTimeout(handler, timeout, ...args);
      }
    );
    vi.stubGlobal("navigator", {
      ...navigator,
      clipboard: { writeText },
    });
    render(<OtherDatabaseObjectsPanel isLoading={false} objects={objects} />);

    const card = screen
      .getByText("shipping.shipment_status")
      .closest("article");
    if (!(card instanceof HTMLElement)) {
      throw new Error("Missing type card");
    }
    await user.click(
      within(card).getByRole("button", { name: SHIPMENT_STATUS_BUTTON_RE })
    );
    await user.click(within(card).getByRole("button", { name: "Copy SQL" }));
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe("SQL copied.")
    );

    act(() => clearNotice?.());
    expect(screen.queryByRole("status")).toBeNull();
  });
});
