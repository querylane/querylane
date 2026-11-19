import {
  create,
  type DescMessage,
  type DescMethodUnary,
  fromJson,
  type JsonValue,
  type MessageInitShape,
  type MessageShape,
  toJson,
} from "@bufbuild/protobuf";
import { afterAll, afterEach, beforeAll } from "@rstest/core";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";

export function setupRpcServer() {
  const server = setupServer();
  beforeAll(() => {
    server.listen({ onUnhandledRequest: "error" });
  });
  afterEach(() => {
    server.resetHandlers();
  });
  afterAll(() => {
    server.close();
  });
  return server;
}

export function rpcPath(method: DescMethodUnary) {
  return `*/${method.parent.typeName}/${method.name}`;
}

export function rpcJson(body: JsonValue, status = 200) {
  const response = HttpResponse.json(body, { status });
  response.headers.set("Content-Type", "application/json");
  return response;
}

export function unaryRpc<I extends DescMessage, O extends DescMessage>(
  method: DescMethodUnary<I, O>,
  reply: (
    input: MessageShape<I>,
    request: Request
  ) => MessageInitShape<O> | Promise<MessageInitShape<O>>
) {
  return http.post(rpcPath(method), async ({ request }) => {
    const json = (await request.json()) ?? null;
    const input = fromJson(method.input, json);
    const output = create(method.output, await reply(input, request));
    return rpcJson(toJson(method.output, output));
  });
}
