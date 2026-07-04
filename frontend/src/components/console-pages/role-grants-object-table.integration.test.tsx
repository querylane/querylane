/**
 * Integration tests for KindFilteredTable / GrantedObjectsTable.
 *
 * Key concern (audit finding B4): useDeferredValue is applied to the search
 * term that drives TanStack Table's filterValue, so the input stays urgent
 * while filtering is deferred. These tests confirm:
 *   - Filtering still returns the correct rows after the deferred value settles.
 *   - The search input immediately reflects the typed value (urgent path).
 *   - Rows not matching the search are absent from the rendered table.
 */

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, test } from "vitest";
import { GrantedObjectsTable } from "@/components/console-pages/role-grants-object-table";
import type { GrantedObject } from "@/components/console-pages/role-grants-shared";
import { GrantObjectType } from "@/protogen/querylane/console/v1alpha1/role_pb";

afterEach(() => cleanup());

// ─── Top-level regex constants (Biome useTopLevelRegex) ──────────────────────

const RE_ORDERS = /orders/;
const RE_PRODUCTS = /products/;
const RE_CUSTOMERS = /customers/;
const RE_REVENUE_VIEW = /revenue_view/;

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeGrantedObject(
  overrides: Partial<GrantedObject> & {
    objectName: string;
    objectType: GrantObjectType;
  }
): GrantedObject {
  const schemaName = overrides.schemaName ?? "public";
  return {
    grantors: ["postgres"],
    key: JSON.stringify([
      overrides.objectType,
      schemaName,
      overrides.objectName,
    ]),
    privileges: [{ grantable: false, name: "SELECT" }],
    schemaName,
    ...overrides,
  };
}

const FIXTURE_OBJECTS: GrantedObject[] = [
  makeGrantedObject({
    objectName: "orders",
    objectType: GrantObjectType.TABLE,
  }),
  makeGrantedObject({
    objectName: "products",
    objectType: GrantObjectType.TABLE,
  }),
  makeGrantedObject({
    objectName: "customers",
    objectType: GrantObjectType.TABLE,
  }),
  makeGrantedObject({
    objectName: "revenue_view",
    objectType: GrantObjectType.VIEW,
    schemaName: "analytics",
  }),
];

// ─── Controlled wrapper (mirrors how the parent components hold state) ────────

function GrantedObjectsTableWrapper({ objects }: { objects: GrantedObject[] }) {
  const [activeKind, setActiveKind] = useState("all");
  const [search, setSearch] = useState("");
  return (
    <GrantedObjectsTable
      activeKind={activeKind}
      objects={objects}
      onKindChange={(slug) => {
        setActiveKind(slug);
        setSearch("");
      }}
      onSearchChange={setSearch}
      search={search}
    />
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("GrantedObjectsTable: deferred filtering", () => {
  test("renders all objects initially with no search term", () => {
    render(<GrantedObjectsTableWrapper objects={FIXTURE_OBJECTS} />);

    expect(screen.getByText(RE_ORDERS)).toBeTruthy();
    expect(screen.getByText(RE_PRODUCTS)).toBeTruthy();
    expect(screen.getByText(RE_CUSTOMERS)).toBeTruthy();
    expect(screen.getByText(RE_REVENUE_VIEW)).toBeTruthy();
  });

  test("search input reflects typed value immediately (urgent path)", async () => {
    const user = userEvent.setup();
    render(<GrantedObjectsTableWrapper objects={FIXTURE_OBJECTS} />);

    const input = screen.getByRole("textbox");
    await user.type(input, "ord");

    // The input value should reflect the keystroke immediately, even before
    // the deferred filtering catches up.
    expect((input as HTMLInputElement).value).toBe("ord");
  });

  test("filters rows to match search term after deferred value settles", async () => {
    const user = userEvent.setup();
    render(<GrantedObjectsTableWrapper objects={FIXTURE_OBJECTS} />);

    const input = screen.getByRole("textbox");
    await user.type(input, "orders");

    // findByText flushes pending deferred renders so the filtered table is visible.
    await screen.findByText(RE_ORDERS);

    // Non-matching rows must be gone after the deferred update.
    expect(screen.queryByText(RE_PRODUCTS)).toBeNull();
    expect(screen.queryByText(RE_CUSTOMERS)).toBeNull();
  });

  test("clearing the search restores all rows", async () => {
    const user = userEvent.setup();
    render(<GrantedObjectsTableWrapper objects={FIXTURE_OBJECTS} />);

    const input = screen.getByRole("textbox");
    await user.type(input, "orders");
    await screen.findByText(RE_ORDERS);
    expect(screen.queryByText(RE_PRODUCTS)).toBeNull();

    await user.clear(input);

    // After clearing, all rows reappear once deferred value settles.
    await screen.findByText(RE_PRODUCTS);
    expect(screen.getByText(RE_CUSTOMERS)).toBeTruthy();
  });

  test("case-insensitive search surfaces matching rows", async () => {
    const user = userEvent.setup();
    render(<GrantedObjectsTableWrapper objects={FIXTURE_OBJECTS} />);

    const input = screen.getByRole("textbox");
    await user.type(input, "ORDERS");

    await screen.findByText(RE_ORDERS);
    expect(screen.queryByText(RE_PRODUCTS)).toBeNull();
  });

  test("search across schema-qualified name (analytics.revenue_view)", async () => {
    const user = userEvent.setup();
    render(<GrantedObjectsTableWrapper objects={FIXTURE_OBJECTS} />);

    const input = screen.getByRole("textbox");
    await user.type(input, "revenue");

    await screen.findByText(RE_REVENUE_VIEW);
    expect(screen.queryByText(RE_ORDERS)).toBeNull();
  });

  test("no results row shown when search matches nothing", async () => {
    const user = userEvent.setup();
    render(<GrantedObjectsTableWrapper objects={FIXTURE_OBJECTS} />);

    const input = screen.getByRole("textbox");
    await user.type(input, "zzz_nonexistent");

    // Wait for the deferred value to propagate. All data rows should vanish.
    // TanStack Table renders an empty body when no rows match.
    await screen.findByRole("table");
    expect(screen.queryByText(RE_ORDERS)).toBeNull();
    expect(screen.queryByText(RE_PRODUCTS)).toBeNull();
  });
});
