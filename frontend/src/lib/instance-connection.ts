import { create as createProto } from "@bufbuild/protobuf";
import type { PostgresConfig } from "@/protogen/querylane/console/v1alpha1/instance_pb";
import { TestInstanceConnectionRequestSchema } from "@/protogen/querylane/console/v1alpha1/instance_pb";

export function buildTestInstanceConnectionRequest(config: PostgresConfig) {
  return createProto(TestInstanceConnectionRequestSchema, {
    config,
  });
}

export function getPostgresConfigFingerprint(config: PostgresConfig) {
  return JSON.stringify({
    database: config.database,
    host: config.host,
    password: config.password,
    port: config.port,
    sslMode: config.sslMode,
    sslNegotiation: config.sslNegotiation,
    username: config.username,
  });
}
