import {
  create,
  createFileRegistry,
  fromBinary,
  getExtension,
} from "@bufbuild/protobuf";
import {
  FieldDescriptorProto_Label,
  FieldDescriptorProto_Type,
  FieldOptionsSchema,
  FileDescriptorProtoSchema,
} from "@bufbuild/protobuf/wkt";
import { expect, test } from "@rstest/core";
import {
  FieldBehavior,
  field_behavior as fieldBehaviorExtension,
} from "@/protogen/google/api/field_behavior_pb";
import { InstanceSchema } from "@/protogen/querylane/console/v1alpha1/instance_pb";
import { createUpdateMask, dirtyFieldsFromValues } from "./field-mask";

// Independent protobuf wire fixtures for repeated google.api.field_behavior
// (extension 1052): OUTPUT_ONLY=3, IMMUTABLE=5, IDENTIFIER=8. Both encodings
// must be readable even though the local descriptor specifies packed:false.
test.each([
  {
    encoding: "unpacked",
    combined: [0xe0, 0x41, 3, 0xe0, 0x41, 5, 0xe0, 0x41, 8],
    individual: [
      { name: "output_only", wire: [0xe0, 0x41, 3] },
      { name: "immutable", wire: [0xe0, 0x41, 5] },
      { name: "identifier", wire: [0xe0, 0x41, 8] },
    ],
  },
  {
    encoding: "packed",
    combined: [0xe2, 0x41, 3, 3, 5, 8],
    individual: [
      { name: "output_only", wire: [0xe2, 0x41, 1, 3] },
      { name: "immutable", wire: [0xe2, 0x41, 1, 5] },
      { name: "identifier", wire: [0xe2, 0x41, 1, 8] },
    ],
  },
])(
  "excludes each non-updatable field with $encoding behavior options",
  ({ combined, individual }) => {
    expect(
      getExtension(
        fromBinary(FieldOptionsSchema, new Uint8Array(combined)),
        fieldBehaviorExtension
      )
    ).toEqual([
      FieldBehavior.OUTPUT_ONLY,
      FieldBehavior.IMMUTABLE,
      FieldBehavior.IDENTIFIER,
    ]);
    const protectedFields = individual.map(({ name, wire }, index) => ({
      name,
      number: index + 1,
      label: FieldDescriptorProto_Label.OPTIONAL,
      type: FieldDescriptorProto_Type.STRING,
      options: fromBinary(FieldOptionsSchema, new Uint8Array(wire)),
    }));
    const registry = createFileRegistry(
      create(FileDescriptorProtoSchema, {
        name: "edit-test.proto",
        package: "test",
        syntax: "proto3",
        messageType: [
          {
            name: "Edit",
            field: [
              ...protectedFields,
              {
                name: "editable_field",
                number: 4,
                label: FieldDescriptorProto_Label.OPTIONAL,
                type: FieldDescriptorProto_Type.STRING,
              },
            ],
          },
        ],
      }),
      () => undefined
    );
    const schema = registry.getMessage("test.Edit");
    if (!schema) {
      throw new Error("Missing edit fixture descriptor");
    }
    expect(
      createUpdateMask({
        schema,
        dirtyFields: {
          outputOnly: true,
          immutable: true,
          identifier: true,
          editableField: true,
        },
        currentValues: {
          outputOnly: "changed",
          immutable: "changed",
          identifier: "changed",
          editableField: "changed",
        },
      }).paths
    ).toEqual(["editable_field"]);
  }
);

test("masks nested instance edits and clears without including output-only identifiers", () => {
  const initialValues = {
    name: "instances/primary",
    displayName: "Primary",
    labels: { environment: "development" },
    config: { host: "db.internal", password: "secret" },
    connectionError: "offline",
  };
  const currentValues = {
    name: "instances/other",
    displayName: "",
    labels: {},
    config: { host: "other.internal", password: "" },
    connectionError: "",
  };
  expect(
    createUpdateMask({
      schema: InstanceSchema,
      dirtyFields: dirtyFieldsFromValues(currentValues, initialValues),
      currentValues,
      initialValues,
    }).paths
  ).toEqual(["display_name", "labels", "config.host", "config.password"]);
});
