interface ApiRequest {
  apiBaseUrl: string;
  headers: Readonly<Record<string, string>>;
  method: string;
  url: string;
}

function shouldGuardApiRequest({
  apiBaseUrl,
  headers,
  method,
  url,
}: ApiRequest) {
  if (method !== "POST") {
    return false;
  }
  // Connect identifies unary requests independently of origin and codec.
  // Proxied same-origin requests must not escape the unmocked-RPC guard.
  if (headers["connect-protocol-version"] === "1") {
    return true;
  }
  if (!(headers["content-type"] ?? "").includes("json")) {
    return false;
  }
  const parsedUrl = new URL(url);
  return (
    parsedUrl.origin === new URL(apiBaseUrl).origin ||
    (parsedUrl.hostname === "localhost" && parsedUrl.port === "8080")
  );
}

export { shouldGuardApiRequest };
