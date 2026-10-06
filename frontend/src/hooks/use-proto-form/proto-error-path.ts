import type { DescMessage } from "@bufbuild/protobuf";
import { protoPathToFormPath as mapProtoPathToFormPath } from "../../lib/protobuf-provider/proto-error-path.js";

export function protoPathToFormPath(schema: DescMessage, serverPath: string): string | null {
  return mapProtoPathToFormPath(schema, serverPath);
}
