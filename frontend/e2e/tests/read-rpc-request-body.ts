import { z } from "zod";

// Shared protobuf JSON routing fields. Endpoint-specific fields remain unknown
// until the endpoint's fixture inspects them; never let postDataJSON leak any.
const rpcRequestBodySchema = z.looseObject({
  name: z.string().optional(),
  parent: z.string().optional(),
  pageToken: z.string().optional(),
});

function readRpcRequestBody(value: unknown) {
  return rpcRequestBodySchema.parse(value);
}

export { readRpcRequestBody };
