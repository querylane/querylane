import { Code, ConnectError } from "@connectrpc/connect";
import { describe, expect, test, vi } from "vitest";
import type { UnexpectedResponseInfo } from "@/lib/unexpected-response";
import {
  BODY_SNIPPET_MAX_LENGTH,
  classifyUnexpectedResponseKind,
  createUnexpectedResponseFetch,
  findUnexpectedResponse,
  isConnectContentType,
  isRedirectResponse,
  UnexpectedResponseError,
} from "@/lib/unexpected-response";

const RPC_URL = "https://console.example.test/api/rpc";
const HTML_LOGIN_BODY =
  "<html><head><title>Sign in</title></head><body>Please sign in</body></html>";

function createBaseFetch(response: Response) {
  return vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
    Promise.resolve(response)
  );
}

function createResponse({
  body,
  contentType,
  status = 200,
}: {
  body: BodyInit | null;
  contentType?: string;
  status?: number;
}) {
  return new Response(body, {
    headers: contentType ? { "content-type": contentType } : {},
    status,
  });
}

async function captureUnexpectedResponseError(
  promise: Promise<Response>
): Promise<UnexpectedResponseError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof UnexpectedResponseError) {
      return error;
    }
    throw new Error("expected UnexpectedResponseError from the fetch", {
      cause: error,
    });
  }
  throw new Error("expected the fetch to reject with UnexpectedResponseError");
}

describe("createUnexpectedResponseFetch", () => {
  test.each([
    "application/json",
    "application/json; charset=utf-8",
    "application/proto",
    "application/connect+json",
    "application/connect+proto",
  ])("passes through 200 responses with content type %s", async (contentType) => {
    const original = createResponse({ body: '{"ok":true}', contentType });
    const fetchWithDetection = createUnexpectedResponseFetch(
      createBaseFetch(original)
    );

    const response = await fetchWithDetection(RPC_URL);

    expect(response).toBe(original);
    await expect(response.text()).resolves.toBe('{"ok":true}');
  });

  test("passes through non-200 Connect error JSON untouched", async () => {
    const original = createResponse({
      body: '{"code":"unauthenticated","message":"token expired"}',
      contentType: "application/json",
      status: 401,
    });
    const fetchWithDetection = createUnexpectedResponseFetch(
      createBaseFetch(original)
    );

    const response = await fetchWithDetection(RPC_URL);

    expect(response).toBe(original);
    await expect(response.json()).resolves.toMatchObject({
      code: "unauthenticated",
    });
  });

  test("intercepts a 200 HTML response with a sanitized snippet", async () => {
    const fetchWithDetection = createUnexpectedResponseFetch(
      createBaseFetch(
        createResponse({ body: HTML_LOGIN_BODY, contentType: "text/html" })
      )
    );

    const error = await captureUnexpectedResponseError(
      fetchWithDetection(RPC_URL)
    );

    expect(error.info).toMatchObject({
      contentType: "text/html",
      kind: "unexpected",
      status: 200,
    });
    expect(error.info.bodySnippet).toContain("<html>");
    expect(error.message).not.toContain("<html>");
  });

  test("truncates large bodies in the snippet", async () => {
    const fetchWithDetection = createUnexpectedResponseFetch(
      createBaseFetch(
        createResponse({
          body: `<html>${"a".repeat(3 * BODY_SNIPPET_MAX_LENGTH)}</html>`,
          contentType: "text/html",
        })
      )
    );

    const error = await captureUnexpectedResponseError(
      fetchWithDetection(RPC_URL)
    );

    expect(error.info.bodySnippet).toHaveLength(BODY_SNIPPET_MAX_LENGTH);
  });

  test.each([
    { kind: "auth", status: 401 },
    { kind: "auth", status: 403 },
    { kind: "server", status: 502 },
    { kind: "server", status: 503 },
    { kind: "unexpected", status: 404 },
  ])("classifies an HTTP $status HTML page as $kind", async ({
    kind,
    status,
  }) => {
    const fetchWithDetection = createUnexpectedResponseFetch(
      createBaseFetch(
        createResponse({
          body: HTML_LOGIN_BODY,
          contentType: "text/html",
          status,
        })
      )
    );

    const error = await captureUnexpectedResponseError(
      fetchWithDetection(RPC_URL)
    );

    expect(error.info).toMatchObject({ kind, status });
  });

  test("intercepts responses without a content type", async () => {
    const fetchWithDetection = createUnexpectedResponseFetch(
      createBaseFetch(createResponse({ body: new Uint8Array([1, 2, 3]) }))
    );

    const error = await captureUnexpectedResponseError(
      fetchWithDetection(RPC_URL)
    );

    expect(error.info).toMatchObject({ contentType: null, kind: "unexpected" });
  });

  test("intercepts a non-200 JSON content type hiding an HTML body", async () => {
    const fetchWithDetection = createUnexpectedResponseFetch(
      createBaseFetch(
        createResponse({
          body: HTML_LOGIN_BODY,
          contentType: "application/json",
          status: 502,
        })
      )
    );

    const error = await captureUnexpectedResponseError(
      fetchWithDetection(RPC_URL)
    );

    expect(error.info).toMatchObject({ kind: "server", status: 502 });
    expect(error.info.bodySnippet).toContain("<html>");
  });

  test("classifies redirect responses", async () => {
    const fetchWithDetection = createUnexpectedResponseFetch(
      createBaseFetch(new Response(null, { status: 302 }))
    );

    const error = await captureUnexpectedResponseError(
      fetchWithDetection(RPC_URL)
    );

    expect(error.info).toMatchObject({ bodySnippet: null, kind: "redirect" });
  });

  test("forwards request options and forces manual redirects", async () => {
    const baseFetch = createBaseFetch(
      createResponse({ body: "{}", contentType: "application/json" })
    );
    const fetchWithDetection = createUnexpectedResponseFetch(baseFetch);
    const controller = new AbortController();

    await fetchWithDetection(RPC_URL, {
      body: '{"ping":true}',
      headers: { "content-type": "application/json" },
      method: "POST",
      redirect: "error",
      signal: controller.signal,
    });

    expect(baseFetch).toHaveBeenCalledWith(RPC_URL, {
      body: '{"ping":true}',
      headers: { "content-type": "application/json" },
      method: "POST",
      redirect: "manual",
      signal: controller.signal,
    });
  });

  test("lets genuine network failures pass through untouched", async () => {
    const failure = new TypeError("Failed to fetch");
    const fetchWithDetection = createUnexpectedResponseFetch(
      vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
        Promise.reject(failure)
      )
    );

    await expect(fetchWithDetection(RPC_URL)).rejects.toBe(failure);
  });
});

describe("classification helpers", () => {
  test("classifyUnexpectedResponseKind covers opaqueredirect status 0", () => {
    expect(classifyUnexpectedResponseKind(0)).toBe("redirect");
    expect(classifyUnexpectedResponseKind(307)).toBe("redirect");
    expect(classifyUnexpectedResponseKind(401)).toBe("auth");
    expect(classifyUnexpectedResponseKind(500)).toBe("server");
    expect(classifyUnexpectedResponseKind(418)).toBe("unexpected");
  });

  test("isRedirectResponse recognizes opaqueredirect responses", () => {
    expect(isRedirectResponse({ status: 0, type: "opaqueredirect" })).toBe(
      true
    );
    expect(isRedirectResponse({ status: 302, type: "basic" })).toBe(true);
    expect(isRedirectResponse({ status: 200, type: "basic" })).toBe(false);
  });

  test("isConnectContentType rejects lookalike types", () => {
    expect(isConnectContentType("application/jsonp")).toBe(false);
    expect(isConnectContentType("text/html; charset=utf-8")).toBe(false);
    expect(isConnectContentType(null)).toBe(false);
    expect(isConnectContentType("application/JSON")).toBe(true);
  });
});

describe("findUnexpectedResponse", () => {
  const info: UnexpectedResponseInfo = {
    bodySnippet: null,
    contentType: "text/html",
    kind: "auth",
    status: 401,
    url: RPC_URL,
  };

  test("reads the info from a direct instance", () => {
    expect(findUnexpectedResponse(new UnexpectedResponseError(info))).toEqual(
      info
    );
  });

  test("reads the info through ConnectError wrapping", () => {
    const wrapped = ConnectError.from(new UnexpectedResponseError(info));

    expect(wrapped.code).toBe(Code.Unknown);
    expect(findUnexpectedResponse(wrapped)).toEqual(info);
  });

  test("returns null for unrelated errors", () => {
    expect(findUnexpectedResponse(new Error("boom"))).toBeNull();
    expect(
      findUnexpectedResponse(new ConnectError("boom", Code.Internal))
    ).toBeNull();
    expect(findUnexpectedResponse(null)).toBeNull();
  });
});
