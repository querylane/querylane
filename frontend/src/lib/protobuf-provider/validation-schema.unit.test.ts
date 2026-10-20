import {
  create,
  type DescMessage,
  type MessageShape,
  type MessageValidType,
} from "@bufbuild/protobuf";
import { StringValueSchema } from "@bufbuild/protobuf/wkt";
import * as protovalidateActual from "@bufbuild/protovalidate" with {
  rstest: "importActual",
};
import type { ValidationResult } from "@bufbuild/protovalidate";
import { expect, rs, test } from "@rstest/core";
import { createDescriptorAwareStandardSchema } from "./validation-schema";

rs.mock("@bufbuild/protovalidate", () => ({
  ...protovalidateActual,
  createValidator: () => ({
    validate<Desc extends DescMessage>(
      _schema: Desc,
      message: MessageShape<Desc>
    ): ValidationResult<MessageValidType<Desc>, MessageShape<Desc>> {
      return {
        error: new protovalidateActual.RuntimeError("Rule evaluation failed"),
        kind: "error",
        message,
        violations: undefined,
      };
    },
  }),
}));

test("a validator runtime failure cannot produce validated form data", async () => {
  const schema = createDescriptorAwareStandardSchema(StringValueSchema);
  const result = await schema["~standard"].validate(
    create(StringValueSchema, { value: "unverified" })
  );

  expect(result).toEqual({ issues: [{ message: "Rule evaluation failed" }] });
});
