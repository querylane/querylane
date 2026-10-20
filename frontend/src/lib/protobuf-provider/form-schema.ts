import type { DescMessage, MessageShape } from "@bufbuild/protobuf";
import type { FormValues } from "@/lib/core/field-model";
import type { StandardSchemaV1 } from "@/lib/core/standard-schema";

import {
  type ProtoFormOptions,
  validateFormValuesAgainstProtoSchema,
} from "./hook-runtime.js";
import { createDescriptorAwareStandardSchema } from "./validation-schema.js";

function isFormValueObject(value: unknown): value is FormValues {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createProtoFormSchema<
  Input extends object = FormValues,
  Desc extends DescMessage = DescMessage,
>(
  desc: Desc,
  options: ProtoFormOptions = {}
): StandardSchemaV1<Input, MessageShape<Desc>> {
  const messageSchema = createDescriptorAwareStandardSchema(desc, options);

  return {
    "~standard": {
      validate: (value) => {
        if (!isFormValueObject(value)) {
          return {
            issues: [
              { message: "Expected form values to be an object.", path: [] },
            ],
          };
        }
        return validateFormValuesAgainstProtoSchema({
          desc,
          values: value,
          schema: messageSchema,
          options,
        });
      },
      vendor: "protoform",
      version: 1,
    },
  };
}
