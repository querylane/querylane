import type { DescMessage, MessageValidType } from "@bufbuild/protobuf";
import type { FormValues, StandardSchemaV1 } from "../core/index.js";

import { type ProtoFormOptions, validateFormValuesAgainstProtoSchema } from "./hook-runtime.js";
import { createDescriptorAwareStandardSchema } from "./validation-schema.js";

function isFormValueObject(value: unknown): value is FormValues {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Expose protovalidate + CEL validation of a proto message as a Standard
 * Schema over FORM values: input is the form value bag, output is the
 * validated typed message, and failure issues carry form-shaped paths
 * (camelCase keys, oneofs flattened, map keys resolved to entry indices).
 *
 * This is the interop seam: anything that speaks Standard Schema v1
 * (React Hook Form via standardSchemaResolver, TanStack Form natively)
 * gets proto validation without importing protovalidate directly.
 */
export function createProtoFormSchema<Input extends object = FormValues, Desc extends DescMessage = DescMessage>(
  desc: Desc,
  options: ProtoFormOptions = {}
): StandardSchemaV1<Input, MessageValidType<Desc>> {
  const messageSchema = createDescriptorAwareStandardSchema(desc, options);

  return {
    "~standard": {
      validate: (value) => {
        if (!isFormValueObject(value)) {
          return {
            issues: [{ message: "Expected form values to be an object.", path: [] }],
          };
        }
        return validateFormValuesAgainstProtoSchema(desc, value, messageSchema, options);
      },
      vendor: "protoform",
      version: 1,
    },
  };
}
