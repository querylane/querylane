import { getResponse, type HttpHandler, HttpResponse, http } from "msw";
import type { Page, Route } from "playwright/test";
import { readRpcRequestBody } from "./read-rpc-request-body.test-utils";

const REGEXP_METACHARACTERS = /[.*+?^${}()|[\]\\]/gu;

async function fulfillFromMsw(route: Route, handler: HttpHandler) {
  const request = route.request();
  const body = request.postDataBuffer();
  const response = await getResponse(
    [handler],
    new Request(request.url(), {
      ...(body === null ? {} : { body: Uint8Array.from(body) }),
      headers: request.headers(),
      method: request.method(),
    })
  );
  if (!response) {
    await route.fallback();
    return;
  }
  await route.fulfill({
    body: Buffer.from(await response.arrayBuffer()),
    headers: Object.fromEntries(response.headers),
    status: response.status,
  });
}

function mockNetwork(page: Page, match: string | RegExp, handler: HttpHandler) {
  return page.route(match, (route) => fulfillFromMsw(route, handler));
}

type RpcResolver = (
  request: Record<string, unknown>
) => Response | Promise<Response>;

function rpcPath(method: string) {
  const escapedMethod = method.replaceAll(REGEXP_METACHARACTERS, "\\$&");
  return new RegExp(`(?:\\.|/)${escapedMethod}$`, "u");
}

function mockRpcStream(
  page: Page,
  method: string,
  { once = false, respond }: { once?: boolean; respond: () => Response }
) {
  return mockNetwork(page, rpcPath(method), http.post("*", respond, { once }));
}

function mockRpcResponse(page: Page, method: string, respond: RpcResolver) {
  return mockNetwork(
    page,
    rpcPath(method),
    http.post(
      "*",
      async ({ request }) =>
        await respond(readRpcRequestBody(await request.json()))
    )
  );
}

function waitForRpc(
  page: Page,
  method: string,
  matches: (body: Record<string, unknown>) => boolean = () => true
) {
  const path = rpcPath(method);
  return page
    .waitForRequest(
      (request) =>
        request.method() === "POST" &&
        path.test(request.url()) &&
        matches(readRpcRequestBody(request.postDataJSON()))
    )
    .then((request) => readRpcRequestBody(request.postDataJSON()));
}

function mockRpc(page: Page, method: string, body: Record<string, unknown>) {
  return mockRpcResponse(page, method, () => HttpResponse.json(body));
}

function mockRpcWith(
  page: Page,
  method: string,
  respond: (request: Record<string, unknown>) => Record<string, unknown>
) {
  return mockRpcResponse(page, method, (request) =>
    HttpResponse.json(respond(request))
  );
}

function mockRpcError({
  page,
  method,
  message,
  code = "internal",
  status = 500,
  once = false,
}: {
  page: Page;
  method: string;
  message: string;
  code?: string;
  status?: number;
  once?: boolean;
}) {
  return mockNetwork(
    page,
    rpcPath(method),
    http.post("*", () => HttpResponse.json({ code, message }, { status }), {
      once,
    })
  );
}

export {
  fulfillFromMsw,
  mockNetwork,
  mockRpc,
  mockRpcError,
  mockRpcResponse,
  mockRpcStream,
  mockRpcWith,
  waitForRpc,
};
