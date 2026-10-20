import { StringValueSchema } from "@bufbuild/protobuf/wkt";
import { expect, test } from "@rstest/core";
import { createProtoFormSchema } from "./form-schema";

test("rejects object values for scalar string fields instead of validating default object text", async () => {
  const schema = createProtoFormSchema(StringValueSchema);
  const result = await schema["~standard"].validate({
    value: { injected: true },
  });
  expect(result).toMatchObject({
    issues: [{ message: "Expected a scalar string form value", path: [] }],
  });
});
