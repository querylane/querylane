import { create as createProto } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";
import {
  buildInstanceUpdatePaths,
  type InstanceFormState,
  type InstanceLabelEntry,
  type InstanceRecord,
  labelsEqual,
  parseInstanceFormPort,
  trimInstanceFormState,
  validateInstanceForm,
} from "@/components/console-pages/instance-config-model";
import {
  Instance_CredentialState,
  InstanceSchema,
  PostgresConfigSchema,
} from "@/protogen/querylane/console/v1alpha1/instance_pb";

const TEST_NUMBER_5432 = 5432;

function label(
  key: string,
  value: string,
  id = `${key}-${value}`
): InstanceLabelEntry {
  return { id, key, value };
}

describe("instance config model", () => {
  it("compares labels independent of order", () => {
    expect(
      labelsEqual(
        [label("team", "database"), label("env", "prod")],
        [label("env", "prod"), label("team", "database")]
      )
    ).toBe(true);
  });

  it("does not collapse duplicate label keys", () => {
    expect(
      labelsEqual(
        [label("a", "1", "first"), label("a", "1", "second")],
        [label("a", "1"), label("b", "2")]
      )
    ).toBe(false);
  });
});

describe("instance config validation", () => {
  const validForm = {
    database: "querylane",
    displayName: "Production",
    host: "db.internal",
    labels: [],
    password: "secret",
    port: "5432",
    sslMode: "prefer",
    sslNegotiation: "postgres",
    username: "querylane",
  };

  it("rejects blank required connection fields before save", () => {
    const result = validateInstanceForm({
      ...validForm,
      database: " ",
      displayName: " ",
      host: " ",
      username: " ",
    });

    expect(result.firstInvalidField).toBe("displayName");
    expect(result.errors).toMatchObject({
      database: "Default database is required.",
      displayName: "Display name is required.",
      host: "Host is required.",
      username: "Username is required.",
    });
  });

  it("strictly validates postgres port range", () => {
    expect(parseInstanceFormPort("5432abc")).toBeNull();
    expect(parseInstanceFormPort("0")).toBeNull();
    expect(parseInstanceFormPort("65536")).toBeNull();
    expect(parseInstanceFormPort(" 5432 ")).toBe(TEST_NUMBER_5432);
  });

  it("requires complete label keys", () => {
    const result = validateInstanceForm({
      ...validForm,
      labels: [{ id: "1", key: " ", value: "prod" }],
    });

    expect(result.errors.labels).toBe("Label keys cannot be empty.");
  });

  it("rejects direct SSL negotiation unless SSL mode requires TLS", () => {
    const result = validateInstanceForm({
      ...validForm,
      sslMode: "allow",
      sslNegotiation: "direct",
    });

    expect(result.errors.sslNegotiation).toBe(
      "Direct SSL negotiation requires SSL mode require, verify-ca, or verify-full."
    );
    expect(result.firstInvalidField).toBe("sslNegotiation");
  });
});

describe("instance config update paths", () => {
  const persistedInstance: InstanceRecord = createProto(InstanceSchema, {
    config: createProto(PostgresConfigSchema, {
      database: "querylane",
      host: "db.internal",
      password: "secret",
      port: 5432,
      sslMode: 3,
      sslNegotiation: 1,
      username: "querylane",
    }),
    displayName: "Production",
    labels: { env: "prod" },
  });

  const persistedForm: InstanceFormState = {
    database: "querylane",
    displayName: "Production",
    host: "db.internal",
    labels: [label("env", "prod")],
    password: "secret",
    port: "5432",
    sslMode: "prefer",
    sslNegotiation: "postgres",
    username: "querylane",
  };

  it("builds update paths only for changed fields", () => {
    const updatePaths = buildInstanceUpdatePaths({
      formState: {
        ...persistedForm,
        displayName: "Production Writer",
        host: "writer.internal",
        labels: [label("env", "prod"), label("owner", "data")],
        port: "6432",
      },
      instance: persistedInstance,
      nextPort: 6432,
    });

    expect(updatePaths).toEqual([
      "display_name",
      "config.host",
      "config.port",
      "labels",
    ]);
  });

  it("returns no paths when form matches persisted instance", () => {
    expect(
      buildInstanceUpdatePaths({
        formState: persistedForm,
        instance: persistedInstance,
        nextPort: 5432,
      })
    ).toEqual([]);
  });

  it("treats unspecified persisted SSL negotiation as postgres", () => {
    expect(
      buildInstanceUpdatePaths({
        formState: persistedForm,
        instance: createProto(InstanceSchema, {
          config: createProto(PostgresConfigSchema, {
            database: "querylane",
            host: "db.internal",
            password: "secret",
            port: 5432,
            sslMode: 3,
            username: "querylane",
          }),
          displayName: "Production",
          labels: { env: "prod" },
        }),
        nextPort: 5432,
      })
    ).toEqual([]);
  });

  it("updates SSL negotiation independently", () => {
    expect(
      buildInstanceUpdatePaths({
        formState: {
          ...persistedForm,
          sslMode: "require",
          sslNegotiation: "direct",
        },
        instance: persistedInstance,
        nextPort: 5432,
      })
    ).toEqual(["config.ssl_mode", "config.ssl_negotiation"]);
  });

  it("does not require or update an untouched blank password", () => {
    const untouchedPasswordForm = {
      ...persistedForm,
      displayName: "Production Writer",
      password: "",
    };

    expect(
      validateInstanceForm(untouchedPasswordForm).errors.password
    ).toBeUndefined();
    expect(
      buildInstanceUpdatePaths({
        formState: untouchedPasswordForm,
        instance: createProto(InstanceSchema, {
          config: createProto(PostgresConfigSchema, {
            database: "querylane",
            host: "db.internal",
            password: "",
            port: 5432,
            sslMode: 3,
            sslNegotiation: 1,
            username: "querylane",
          }),
          displayName: "Production",
          labels: { env: "prod" },
        }),
        nextPort: 5432,
      })
    ).toEqual(["display_name"]);
  });

  it("trims text fields once at the boundary without touching the password", () => {
    const trimmed = trimInstanceFormState({
      ...persistedForm,
      database: " querylane ",
      dirtyFields: { password: true },
      displayName: " Production ",
      host: " db.internal ",
      password: " secret ",
      port: " 5432 ",
      username: " querylane ",
    });

    expect(trimmed).toMatchObject({
      database: "querylane",
      dirtyFields: { password: true },
      displayName: "Production",
      host: "db.internal",
      password: " secret ",
      port: "5432",
      username: "querylane",
    });
    expect(trimmed.labels).toEqual(persistedForm.labels);
  });

  it("produces no update paths for whitespace-only changes after trimming", () => {
    expect(
      buildInstanceUpdatePaths({
        formState: trimInstanceFormState({
          ...persistedForm,
          displayName: " Production ",
          host: " db.internal ",
        }),
        instance: persistedInstance,
        nextPort: 5432,
      })
    ).toEqual([]);
  });

  it("requires and updates a dirty blank password", () => {
    const dirtyPasswordForm = {
      ...persistedForm,
      dirtyFields: { password: true as const },
      password: "",
    };

    expect(validateInstanceForm(dirtyPasswordForm).errors.password).toBe(
      "Password is required."
    );
    expect(
      buildInstanceUpdatePaths({
        formState: dirtyPasswordForm,
        instance: persistedInstance,
        nextPort: 5432,
      })
    ).toContain("config.password");
  });

  it("replaces the full config when repairing unreadable credentials", () => {
    const unreadableInstance = createProto(InstanceSchema, {
      config: createProto(PostgresConfigSchema, {
        database: "querylane",
        host: "db.internal",
        port: 5432,
        sslMode: 3,
        sslNegotiation: 1,
        username: "querylane",
      }),
      credentialState: Instance_CredentialState.UNREADABLE,
      displayName: "Production",
      labels: { env: "prod" },
    });

    expect(
      buildInstanceUpdatePaths({
        formState: {
          ...persistedForm,
          dirtyFields: { password: true },
          password: "replacement-secret",
        },
        instance: unreadableInstance,
        nextPort: 5432,
      })
    ).toEqual(["config"]);
  });
});
