import {
  create,
  fromBinary,
  fromJson,
  toBinary,
  toJson,
} from "@bufbuild/protobuf";
import { file_buf_validate_validate } from "@bufbuild/protovalidate/gen/buf/validate/validate_pb.js";
import { expect, test } from "@rstest/core";
import {
  InstanceSchema,
  PostgresConfig_SslMode,
  PostgresConfig_SslNegotiation,
  PostgresConfigSchema,
} from "@/protogen/querylane/console/v1alpha1/instance_pb";
import { createDescriptorAwareStandardSchema } from "./validation-schema";

test("generated API schemas share the validation runtime's descriptor", () => {
  const validationDependency = InstanceSchema.file.dependencies.find(
    (file) => file.name === "buf/validate/validate"
  );

  expect(validationDependency).toBe(file_buf_validate_validate);
});

test("shared descriptors preserve RPC serialization and valid connection configuration", async () => {
  const json = {
    database: "postgres",
    host: "localhost",
    password: "test-password",
    port: 5432,
    username: "querylane",
  };
  const message = fromJson(PostgresConfigSchema, json);
  const decoded = fromBinary(
    PostgresConfigSchema,
    toBinary(PostgresConfigSchema, message)
  );
  const schema = createDescriptorAwareStandardSchema(PostgresConfigSchema);

  expect(toJson(PostgresConfigSchema, decoded)).toEqual(json);
  expect(await schema["~standard"].validate(decoded)).toEqual({
    value: decoded,
  });
});

test("shared descriptors retain every required-field and numeric-range validation", async () => {
  const schema = createDescriptorAwareStandardSchema(PostgresConfigSchema);
  const result = await schema["~standard"].validate(
    create(PostgresConfigSchema)
  );

  expect(result.issues?.map((issue) => issue.path)).toEqual([
    ["host"],
    ["port"],
    ["database"],
    ["username"],
    ["password"],
  ]);
});

test("shared descriptors retain message-level CEL rules", async () => {
  const schema = createDescriptorAwareStandardSchema(PostgresConfigSchema);
  const result = await schema["~standard"].validate(
    create(PostgresConfigSchema, {
      database: "postgres",
      host: "localhost",
      password: "test-password",
      port: 5432,
      sslMode: PostgresConfig_SslMode.DISABLED,
      sslNegotiation: PostgresConfig_SslNegotiation.DIRECT,
      username: "querylane",
    })
  );

  expect(result.issues).toEqual([
    {
      message:
        "ssl_negotiation direct requires ssl_mode require, verify-ca, or verify-full",
    },
  ]);
});
