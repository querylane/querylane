import { beforeEach, describe, expect, test } from "vitest";
import { useDatabaseVisualizationStore } from "@/features/database-visualization/database-visualization-store";

describe("useDatabaseVisualizationStore", () => {
  beforeEach(() => {
    useDatabaseVisualizationStore.setState({
      databaseSelectedNodeId: null,
      roleSelectedNodeId: null,
    });
  });

  test("keeps database and role canvas selections independent", () => {
    useDatabaseVisualizationStore
      .getState()
      .setDatabaseSelectedNodeId("table:public.orders");
    useDatabaseVisualizationStore
      .getState()
      .setRoleSelectedNodeId("role:app_user");

    expect(
      useDatabaseVisualizationStore.getState().databaseSelectedNodeId
    ).toBe("table:public.orders");
    expect(useDatabaseVisualizationStore.getState().roleSelectedNodeId).toBe(
      "role:app_user"
    );

    useDatabaseVisualizationStore.getState().setRoleSelectedNodeId(null);

    expect(
      useDatabaseVisualizationStore.getState().databaseSelectedNodeId
    ).toBe("table:public.orders");
    expect(useDatabaseVisualizationStore.getState().roleSelectedNodeId).toBe(
      null
    );
  });
});
