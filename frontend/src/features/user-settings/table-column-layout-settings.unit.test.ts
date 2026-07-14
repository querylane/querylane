import { beforeEach, describe, expect, it } from "vitest";
import {
  reorderVisibleTableColumns,
  resolveTableColumnLayout,
  useTableColumnLayoutSettingsStore,
} from "@/features/user-settings/table-column-layout-settings";

describe("table column layout settings", () => {
  beforeEach(() => {
    localStorage.clear();
    useTableColumnLayoutSettingsStore.setState({ layouts: {} });
  });

  it("drops deleted columns and appends new columns visibly", () => {
    expect(
      resolveTableColumnLayout(["id", "email", "created_at"], {
        hiddenColumns: ["deleted_column", "email"],
        order: ["email", "deleted_column", "id"],
      })
    ).toEqual({
      hiddenColumns: ["email"],
      order: ["email", "id", "created_at"],
    });
  });

  it("keeps at least one data column visible", () => {
    expect(
      resolveTableColumnLayout(["id", "email"], {
        hiddenColumns: ["id", "email"],
        order: ["email", "id"],
      })
    ).toEqual({
      hiddenColumns: ["id"],
      order: ["email", "id"],
    });
  });

  it("reorders visible columns while hidden columns keep their slots", () => {
    expect(
      reorderVisibleTableColumns(
        ["id", "internal_note", "email", "created_at"],
        ["internal_note"],
        "created_at",
        "id"
      )
    ).toEqual(["created_at", "internal_note", "id", "email"]);
  });

  it("persists layouts independently by full table resource name", () => {
    const customers =
      "instances/prod/databases/app/schemas/public/tables/customers";
    const orders = "instances/prod/databases/app/schemas/public/tables/orders";

    useTableColumnLayoutSettingsStore.getState().setLayout(customers, {
      hiddenColumns: ["email"],
      order: ["email", "id"],
    });
    useTableColumnLayoutSettingsStore.getState().setLayout(orders, {
      hiddenColumns: [],
      order: ["id", "created_at"],
    });

    expect(useTableColumnLayoutSettingsStore.getState().layouts).toEqual({
      [customers]: {
        hiddenColumns: ["email"],
        order: ["email", "id"],
      },
      [orders]: {
        hiddenColumns: [],
        order: ["id", "created_at"],
      },
    });
    expect(localStorage.getItem("querylane-table-column-layouts")).toContain(
      customers
    );
  });

  it("resets one table without changing another table", () => {
    const customers =
      "instances/prod/databases/app/schemas/public/tables/customers";
    const orders = "instances/prod/databases/app/schemas/public/tables/orders";
    const store = useTableColumnLayoutSettingsStore.getState();
    store.setLayout(customers, {
      hiddenColumns: ["email"],
      order: ["email", "id"],
    });
    store.setLayout(orders, {
      hiddenColumns: [],
      order: ["created_at", "id"],
    });

    useTableColumnLayoutSettingsStore.getState().resetLayout(customers);

    expect(useTableColumnLayoutSettingsStore.getState().layouts).toEqual({
      [orders]: {
        hiddenColumns: [],
        order: ["created_at", "id"],
      },
    });
  });

  it("keeps valid persisted layouts and drops malformed entries", async () => {
    const customers =
      "instances/prod/databases/app/schemas/public/tables/customers";
    localStorage.setItem(
      "querylane-table-column-layouts",
      JSON.stringify({
        state: {
          layouts: {
            broken: { hiddenColumns: "email", order: [] },
            [customers]: {
              hiddenColumns: ["email", 42, "email"],
              order: ["id", "email", "id"],
            },
          },
        },
        version: 1,
      })
    );

    await useTableColumnLayoutSettingsStore.persist.rehydrate();

    expect(useTableColumnLayoutSettingsStore.getState().layouts).toEqual({
      [customers]: {
        hiddenColumns: ["email"],
        order: ["id", "email"],
      },
    });
  });

  it("discards stale saved columns when the table schema changes", () => {
    const customers =
      "instances/prod/databases/app/schemas/public/tables/customers";
    useTableColumnLayoutSettingsStore.getState().setLayout(customers, {
      hiddenColumns: ["deleted_column", "email"],
      order: ["email", "deleted_column", "id"],
    });

    useTableColumnLayoutSettingsStore
      .getState()
      .reconcileLayout(customers, ["id", "email", "created_at"]);

    expect(
      useTableColumnLayoutSettingsStore.getState().layouts[customers]
    ).toEqual({
      hiddenColumns: ["email"],
      order: ["email", "id", "created_at"],
    });
  });
});
