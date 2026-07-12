import { describe, expect, test } from "vitest";
import type { PostgresInstance } from "@/lib/db-resource-mappers";
import { resolveHomeInstanceId } from "@/routes/index";

function instance(id: string, credentialsUnreadable = false): PostgresInstance {
  return {
    connectionError: "",
    credentialsUnreadable,
    host: `${id}.internal`,
    id,
    name: id,
    port: 5432,
    resourceName: `instances/${id}`,
    status: credentialsUnreadable ? "error" : "connected",
  };
}

describe("resolveHomeInstanceId", () => {
  test("defaults to the first instance with readable credentials", () => {
    expect(
      resolveHomeInstanceId({
        instances: [instance("broken", true), instance("healthy")],
      })
    ).toBe("healthy");
  });

  test("preserves an explicitly requested unreadable instance", () => {
    expect(
      resolveHomeInstanceId({
        instances: [instance("broken", true), instance("healthy")],
        requestedInstanceId: "broken",
      })
    ).toBe("broken");
  });
});
