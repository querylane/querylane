import {
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

const objects: OtherDatabaseObject[] = [
  {
    badge: "ENUM",
    category: "types",
    definition:
      "CREATE TYPE shipping.shipment_status AS ENUM ('booked', 'in_transit', 'customs_hold', 'delayed', 'delivered', 'cancelled');",
    detail: "Enum values are ordered and can only be added.",
    extra: "used by shipping.shipments.status",
    name: "shipping.shipment_status",
    sortKey: "shipping.shipment_status",
    summary: "booked, in_transit, customs_hold, delayed, delivered, cancelled",
  },
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

const COLLATIONS_BUTTON_RE = /^Collations 1$/;
const CUSTOM_TYPES_INFO_RE = /Custom enums, composites, domains, and ranges/i;
const INTRO_COPY_RE = /everything that isn’t a relation/i;
const SHIPMENT_STATUS_BUTTON_RE = /shipping\.shipment_status/i;
const TYPES_BUTTON_RE = /^Types 2$/;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("OtherDatabaseObjectsPanel", () => {
  it("renders the design's internal object category rail and type cards", () => {
    render(<OtherDatabaseObjectsPanel isLoading={false} objects={objects} />);

    expect(
      screen.getByRole("heading", { name: "Other database objects" })
    ).toBeTruthy();
    expect(screen.getByText(INTRO_COPY_RE)).toBeTruthy();

    expect(screen.getByRole("button", { name: TYPES_BUTTON_RE })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: COLLATIONS_BUTTON_RE })
    ).toBeTruthy();
    expect(screen.getByText(CUSTOM_TYPES_INFO_RE)).toBeTruthy();
    expect(screen.getByText("shipping.shipment_status")).toBeTruthy();
    expect(screen.getByText("shipping.weight_class")).toBeTruthy();
  });

  it("switches categories and filters objects with the section search", async () => {
    const user = userEvent.setup();
    render(<OtherDatabaseObjectsPanel isLoading={false} objects={objects} />);

    await user.click(
      screen.getByRole("button", { name: COLLATIONS_BUTTON_RE })
    );
    expect(screen.getByText("case_insensitive")).toBeTruthy();
    expect(screen.queryByText("shipping.shipment_status")).toBeNull();

    await user.type(
      screen.getByRole("textbox", { name: "Search other database objects" }),
      "phonebook"
    );
    expect(screen.getByText("None in this database.")).toBeTruthy();
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
      expect(writeText).toHaveBeenCalledWith(objects[0]?.definition)
    );
  });
});
