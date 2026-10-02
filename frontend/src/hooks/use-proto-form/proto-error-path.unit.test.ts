import { FileDescriptorSetSchema, ListValueSchema } from "@bufbuild/protobuf/wkt";
import { describe, expect, it } from "@rstest/core";
import { protoPathToFormPath } from "./proto-error-path";

describe("repeated server error paths", () => {
  it.each(["file[0].message_type[1].name", "file.0.message_type.1.name"])(
    "maps %s to the indexed form field",
    (path) => {
      expect(protoPathToFormPath(FileDescriptorSetSchema, path)).toBe(
        "file.0.messageType.1.name"
      );
    }
  );

  it("maps a repeated message's oneof branch", () => {
    expect(protoPathToFormPath(ListValueSchema, "values[0].string_value")).toBe(
      "values.0.kind.value"
    );
  });

  it.each(["file[bad].name", "file.name", "file.0.unknown"])(
    "rejects invalid path %s",
    (path) => {
      expect(protoPathToFormPath(FileDescriptorSetSchema, path)).toBeNull();
    }
  );
});
