import { z } from "zod";

const rpcRequestBodySchema = z.looseObject({
  name: z.string().optional(),
  parent: z.string().optional(),
  pageToken: z.string().optional(),
});

function readRpcRequestBody(value: unknown) {
  return rpcRequestBodySchema.parse(value);
}

export { readRpcRequestBody };
