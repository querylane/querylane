import { describe, expect, test } from "vitest";
import { validateCreateInstanceForm } from "@/routes/new-instance-validation";

describe("validateCreateInstanceForm", () => {
  test("returns all invalid fields in first-focus order", () => {
    const result = validateCreateInstanceForm({
      database: "",
      displayName: "",
      host: "",
      instanceId: "",
      labels: [{ key: "" }],
      password: "",
      port: "70000",
      sslMode: "prefer",
      sslNegotiation: "postgres",
      username: "",
    });

    expect(result.firstInvalidField).toBe("displayName");
    expect(result.errors).toEqual({
      database: "Database is required.",
      displayName: "Display name is required.",
      host: "Host is required.",
      labels: "Label keys cannot be empty.",
      password: "Password is required.",
      port: "Port must be between 1 and 65535.",
      username: "Username is required.",
    });
  });

  test("accepts trimmed required fields and complete labels", () => {
    const result = validateCreateInstanceForm({
      database: " postgres ",
      displayName: " Prod ",
      host: " db.internal ",
      instanceId: "prod",
      labels: [{ key: "environment" }],
      password: "secret",
      port: "5432",
      sslMode: "prefer",
      sslNegotiation: "postgres",
      username: " postgres ",
    });

    expect(result).toEqual({
      errors: {},
      firstInvalidField: null,
    });
  });

  test.each([
    ["abc"],
    ["0"],
    ["5432abc"],
    ["1.5"],
  ])("rejects invalid port %s", (port) => {
    const result = validateCreateInstanceForm({
      database: "postgres",
      displayName: "Prod",
      host: "db.internal",
      instanceId: "prod",
      labels: [],
      password: "secret",
      port,
      sslMode: "prefer",
      sslNegotiation: "postgres",
      username: "postgres",
    });

    expect(result).toEqual({
      errors: {
        port: "Port must be between 1 and 65535.",
      },
      firstInvalidField: "port",
    });
  });

  test("requires direct SSL negotiation to use require or stronger SSL mode", () => {
    const result = validateCreateInstanceForm({
      database: "postgres",
      displayName: "Prod",
      host: "db.internal",
      instanceId: "prod",
      labels: [],
      password: "secret",
      port: "5432",
      sslMode: "prefer",
      sslNegotiation: "direct",
      username: "postgres",
    });

    expect(result).toEqual({
      errors: {
        sslNegotiation:
          "Direct SSL negotiation requires SSL mode require, verify-ca, or verify-full.",
      },
      firstInvalidField: "sslNegotiation",
    });
  });
});
