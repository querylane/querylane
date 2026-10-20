import {
  create,
  type DescMessage,
  type MessageShape,
  type MessageValidType,
} from "@bufbuild/protobuf";
import {
  AnySchema,
  ListValueSchema,
  StringValueSchema,
  StructSchema,
  TimestampSchema,
  ValueSchema,
} from "@bufbuild/protobuf/wkt";
import { describe, expect, test } from "@rstest/core";
import type { StandardSchemaV1 } from "@/lib/core/standard-schema";
import {
  InstanceSchema,
  PostgresConfigSchema,
} from "@/protogen/querylane/console/v1alpha1/instance_pb";
import {
  formValuesToProto,
  protoToFormValues,
  validateFormValuesAgainstProtoSchema,
} from "./hook-runtime";

function roundTrip<Desc extends DescMessage>(
  desc: Desc,
  message: MessageShape<Desc>
) {
  return formValuesToProto({
    desc,
    values: protoToFormValues(desc, message),
    source: message,
  });
}

describe("protobuf form conversion", () => {
  test("round trips nested messages, maps, and unknown wire fields", () => {
    const source = create(InstanceSchema, {
      displayName: "Primary",
      labels: { environment: "development" },
      config: create(PostgresConfigSchema, { host: "localhost", port: 5432 }),
    });
    source.$unknown = [{ no: 999, wireType: 0, data: new Uint8Array([1]) }];
    expect(roundTrip(InstanceSchema, source)).toEqual(source);
  });

  test("round trips oneofs, nested JSON lists, and binary Any payloads", () => {
    const value = create(ValueSchema, {
      kind: {
        case: "listValue",
        value: create(ListValueSchema, {
          values: [
            create(ValueSchema, {
              kind: { case: "stringValue", value: "entry" },
            }),
          ],
        }),
      },
    });
    const any = create(AnySchema, {
      typeUrl: "type.googleapis.com/example.Payload",
      value: new Uint8Array([0, 127, 255]),
    });
    expect(roundTrip(ValueSchema, value)).toEqual(value);
    expect(roundTrip(AnySchema, any)).toEqual(any);
    expect(
      roundTrip(StringValueSchema, create(StringValueSchema, { value: "text" }))
    ).toEqual(create(StringValueSchema, { value: "text" }));
  });

  test("preserves nanoseconds when a timestamp form value remains unchanged", () => {
    const timestamp = create(TimestampSchema, {
      seconds: 1_700_000_000n,
      nanos: 123_456_789,
    });
    expect(roundTrip(TimestampSchema, timestamp)).toEqual(timestamp);
  });

  test("maps validation errors to original map row indexes even with empty rows", async () => {
    const schema: StandardSchemaV1<
      MessageShape<typeof StructSchema>,
      MessageValidType<typeof StructSchema>
    > = {
      "~standard": {
        version: 1,
        vendor: "fixture",
        validate: () => ({
          issues: [
            {
              message: "Invalid nested value",
              path: ["fields", "kept", "kind", "value"],
            },
          ],
        }),
      },
    };
    const result = await validateFormValuesAgainstProtoSchema({
      desc: StructSchema,
      schema,
      values: {
        fields: [
          null,
          {
            key: "kept",
            value: create(ValueSchema, {
              kind: { case: "numberValue", value: 3 },
            }),
          },
        ],
      },
    });
    expect(result).toMatchObject({
      issues: [
        {
          message: "Invalid nested value",
          path: ["fields", 1, "value", "kind", "value"],
        },
      ],
    });
  });
});
