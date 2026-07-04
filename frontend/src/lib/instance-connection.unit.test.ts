import { create as createProto } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";
import {
  PostgresConfig_SslMode,
  PostgresConfig_SslNegotiation,
  PostgresConfigSchema,
} from "@/protogen/querylane/console/v1alpha1/instance_pb";
import {
  buildTestInstanceConnectionRequest,
  getPostgresConfigFingerprint,
} from "./instance-connection";

function buildConfig() {
  return createProto(PostgresConfigSchema, {
    database: "querylane",
    host: "localhost",
    password: "secret",
    port: 5432,
    sslMode: PostgresConfig_SslMode.REQUIRE,
    sslNegotiation: PostgresConfig_SslNegotiation.DIRECT,
    username: "querylane",
  });
}

describe("instance connection helpers", () => {
  it("builds standalone test connection requests from a Postgres config", () => {
    const request = buildTestInstanceConnectionRequest(buildConfig());

    expect(request.config?.database).toBe("querylane");
    expect(request.config?.host).toBe("localhost");
    expect(request.config?.password).toBe("secret");
  });

  it("fingerprints only connection-affecting Postgres config fields", () => {
    const config = buildConfig();
    const sameConnection = createProto(PostgresConfigSchema, {
      ...config,
    });
    const differentNegotiation = createProto(PostgresConfigSchema, {
      ...config,
      sslNegotiation: PostgresConfig_SslNegotiation.POSTGRES,
    });

    expect(getPostgresConfigFingerprint(sameConnection)).toBe(
      getPostgresConfigFingerprint(config)
    );
    expect(getPostgresConfigFingerprint(differentNegotiation)).not.toBe(
      getPostgresConfigFingerprint(config)
    );
  });
});
