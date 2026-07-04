import { describe, expect, test } from "vitest";
import { resolveCreateInstanceSuccessTarget } from "@/lib/create-instance-navigation";

describe("create instance success navigation", () => {
  test("opens explorer for the created instance preferred database", () => {
    expect(
      resolveCreateInstanceSuccessTarget({
        createdInstanceName: "instances/production",
        databases: [
          { name: "instances/production/databases/appdb" },
          { name: "instances/production/databases/postgres" },
        ],
        preferredDatabaseId: "postgres",
      })
    ).toEqual({
      params: { databaseId: "postgres", instanceId: "production" },
      to: "/instances/$instanceId/databases/$databaseId/explorer",
    });
  });

  test("trims preferred database id before matching discovered databases", () => {
    expect(
      resolveCreateInstanceSuccessTarget({
        createdInstanceName: "instances/production",
        databases: [
          { name: "instances/production/databases/appdb" },
          { name: "instances/production/databases/postgres" },
        ],
        preferredDatabaseId: "  postgres  ",
      })
    ).toEqual({
      params: { databaseId: "postgres", instanceId: "production" },
      to: "/instances/$instanceId/databases/$databaseId/explorer",
    });
  });

  test("opens explorer for first database when preferred database is absent", () => {
    expect(
      resolveCreateInstanceSuccessTarget({
        createdInstanceName: "instances/production",
        databases: [
          { name: "instances/production/databases/appdb" },
          { name: "instances/production/databases/postgres" },
        ],
        preferredDatabaseId: "missing",
      })
    ).toEqual({
      params: { databaseId: "appdb", instanceId: "production" },
      to: "/instances/$instanceId/databases/$databaseId/explorer",
    });
  });

  test("falls back to instance overview when no database is discovered", () => {
    expect(
      resolveCreateInstanceSuccessTarget({
        createdInstanceName: "instances/production",
        databases: [],
        preferredDatabaseId: "postgres",
      })
    ).toEqual({
      params: { instanceId: "production" },
      to: "/instances/$instanceId",
    });
  });

  test("falls back home when create response has no instance name", () => {
    expect(
      resolveCreateInstanceSuccessTarget({
        createdInstanceName: undefined,
        databases: [{ name: "instances/production/databases/postgres" }],
        preferredDatabaseId: "postgres",
      })
    ).toEqual({ replace: true, to: "/" });
  });
});
