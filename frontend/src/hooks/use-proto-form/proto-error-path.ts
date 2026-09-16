import type { DescMessage } from "@bufbuild/protobuf";
import { protoPathToFormPath as mapProtoPathToFormPath } from "../../lib/protobuf-provider/proto-error-path.js";

/** Compatibility export. New framework adapters import this helper from the protobuf package. */
export function protoPathToFormPath(schema: DescMessage, serverPath: string): string | null {
  return mapProtoPathToFormPath(schema, serverPath);
}
