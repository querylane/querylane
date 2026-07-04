import { createMutableRegistry, type DescMessage } from "@bufbuild/protobuf";
import { usedTypes } from "@bufbuild/protobuf/reflect";
import { createStandardSchema } from "@bufbuild/protovalidate";

function createProtoStandardSchema<Desc extends DescMessage>(schema: Desc) {
  return createStandardSchema(schema, {
    registry: createMutableRegistry(schema, ...usedTypes(schema)),
  });
}

export { createProtoStandardSchema };
