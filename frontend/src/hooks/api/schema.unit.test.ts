import { describe, expect, test } from "vitest";
import { schemasForDatabaseQueryInput } from "@/hooks/api/schema";

describe("schema query option helpers", () => {
  test("builds canonical schema list input for a database", () => {
    expect(
      schemasForDatabaseQueryInput({
        databaseId: "postgres",
        instanceId: "local",
      })
    ).toEqual({
      orderBy: "name asc",
      pageSize: 100,
      parent: "instances/local/databases/postgres",
    });
  });

  test("includes the filter only when one is provided", () => {
    expect(
      schemasForDatabaseQueryInput({
        databaseId: "postgres",
        filter: 'name:"audit"',
        instanceId: "local",
      })
    ).toEqual({
      filter: 'name:"audit"',
      orderBy: "name asc",
      pageSize: 100,
      parent: "instances/local/databases/postgres",
    });
  });
});
