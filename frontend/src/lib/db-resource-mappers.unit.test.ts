import { create } from "@bufbuild/protobuf";
import { describe, expect, test } from "vitest";
import {
  createFallbackDatabase,
  mapDatabase,
  mapInstance,
} from "@/lib/db-resource-mappers";
import { DatabaseSchema } from "@/protogen/querylane/console/v1alpha1/database_pb";
import {
  Instance_ConnectionState,
  Instance_CredentialState,
  InstanceSchema,
  PostgresConfigSchema,
} from "@/protogen/querylane/console/v1alpha1/instance_pb";

describe("mapInstance", () => {
  test("maps API instances into sidebar resources", () => {
    const instance = create(InstanceSchema, {
      config: create(PostgresConfigSchema, {
        host: "db.internal",
        port: 6543,
      }),
      connectionError: "password authentication failed",
      connectionState: Instance_ConnectionState.ERROR,
      displayName: "Production",
      name: "instances/prod",
    });

    expect(mapInstance(instance)).toEqual({
      connectionError: "password authentication failed",
      credentialsUnreadable: false,
      host: "db.internal",
      id: "prod",
      name: "Production",
      port: 6543,
      resourceName: "instances/prod",
      status: "error",
    });
  });

  test("falls back to resource leaf and default Postgres port", () => {
    const instance = create(InstanceSchema, { name: "instances/local" });

    expect(mapInstance(instance)).toMatchObject({
      host: "",
      id: "local",
      name: "local",
      port: 5432,
      status: "disconnected",
    });
  });

  test.each([
    Instance_CredentialState.UNREADABLE,
    Instance_CredentialState.KEY_MISSING,
  ])("marks unavailable credential state %s as an actionable instance error", (credentialState) => {
    const instance = create(InstanceSchema, {
      credentialError: "Stored credentials cannot be read.",
      credentialState,
      name: "instances/broken",
    });

    expect(mapInstance(instance)).toMatchObject({
      credentialsUnreadable: true,
      status: "error",
    });
  });
});

describe("mapDatabase", () => {
  test("maps API databases and preserves system flag", () => {
    const database = create(DatabaseSchema, {
      characterSet: "UTF8",
      collation: "en_US.UTF-8",
      displayName: "App DB",
      isSystemDatabase: true,
      name: "instances/prod/databases/app",
      owner: "app_owner",
    });

    expect(mapDatabase(database)).toEqual({
      characterSet: "UTF8",
      collation: "en_US.UTF-8",
      id: "app",
      isSystemDatabase: true,
      name: "App DB",
      owner: "app_owner",
      resourceName: "instances/prod/databases/app",
    });
  });

  test("creates fallback database resource names from route ids", () => {
    expect(createFallbackDatabase("prod", "missing")).toEqual({
      characterSet: "",
      collation: "",
      id: "missing",
      isSystemDatabase: false,
      name: "missing",
      owner: "",
      resourceName: "instances/prod/databases/missing",
    });
  });
});
