import { create as createProto } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
import { describe, expect, test } from "vitest";
import {
  extractCreateInstanceFieldViolations,
  extractInstanceConfigFieldViolations,
} from "@/features/create-instance-field-violations";
import { BadRequestSchema } from "@/protogen/google/rpc/error_details_pb";

function badRequestError(
  fieldViolations: { description: string; field: string }[]
) {
  return new ConnectError(
    "invalid CreateInstanceRequest",
    Code.InvalidArgument,
    undefined,
    [
      {
        desc: BadRequestSchema,
        value: createProto(BadRequestSchema, { fieldViolations }),
      },
    ]
  );
}

describe("extractCreateInstanceFieldViolations", () => {
  test("maps every known violation onto its form field", () => {
    const result = extractCreateInstanceFieldViolations(
      badRequestError([
        { description: "could not resolve host", field: "spec.config.host" },
        {
          description: "must be between 1 and 65535",
          field: "spec.config.port",
        },
        { description: "is required", field: "spec.config.database" },
        { description: "is required", field: "spec.config.username" },
        { description: "is required", field: "spec.config.password" },
        {
          description: "must be a defined value",
          field: "spec.config.ssl_mode",
        },
        {
          description: "requires SSL mode require",
          field: "spec.config.ssl_negotiation",
        },
        {
          description: "must be at most 63 characters",
          field: "spec.display_name",
        },
        { description: "must start with a letter", field: "instance_id" },
        { description: "keys cannot be empty", field: "spec.labels" },
      ])
    );

    expect(result.fieldErrors).toEqual({
      database: "is required",
      displayName: "must be at most 63 characters",
      host: "could not resolve host",
      instanceId: "must start with a letter",
      labels: "keys cannot be empty",
      password: "is required",
      port: "must be between 1 and 65535",
      sslMode: "must be a defined value",
      sslNegotiation: "requires SSL mode require",
      username: "is required",
    });
    expect(result.firstInvalidField).toBe("displayName");
  });

  test("supports the legacy instance body prefix", () => {
    const result = extractCreateInstanceFieldViolations(
      badRequestError([
        { description: "is required", field: "instance.config.host" },
      ])
    );

    expect(result.fieldErrors).toEqual({ host: "is required" });
    expect(result.firstInvalidField).toBe("host");
  });

  test("keeps the first description when a field repeats", () => {
    const result = extractCreateInstanceFieldViolations(
      badRequestError([
        { description: "first message", field: "spec.config.host" },
        { description: "second message", field: "spec.config.host" },
      ])
    );

    expect(result.fieldErrors).toEqual({ host: "first message" });
  });

  test("returns unmapped violations so callers can show every server error", () => {
    const result = extractCreateInstanceFieldViolations(
      badRequestError([
        { description: "connection failed", field: "spec.config" },
        { description: "one of spec or instance", field: "spec" },
      ])
    );

    expect(result.fieldErrors).toEqual({});
    expect(result.firstInvalidField).toBeNull();
    expect(result.generalErrors).toEqual([
      "spec.config: connection failed",
      "spec: one of spec or instance",
    ]);
  });

  test("returns no field errors for non-connect errors", () => {
    const result = extractCreateInstanceFieldViolations(
      new Error("network down")
    );

    expect(result.fieldErrors).toEqual({});
    expect(result.firstInvalidField).toBeNull();
    expect(result.generalErrors).toEqual([]);
  });
});

describe("extractInstanceConfigFieldViolations", () => {
  test("maps update-instance config violations onto form fields", () => {
    const result = extractInstanceConfigFieldViolations(
      badRequestError([
        { description: "auth failed", field: "instance.config.password" },
        { description: "database missing", field: "instance.config.database" },
      ])
    );

    expect(result.fieldErrors).toEqual({
      database: "database missing",
      password: "auth failed",
    });
    expect(result.firstInvalidField).toBe("database");
    expect(result.generalErrors).toEqual([]);
  });
});
