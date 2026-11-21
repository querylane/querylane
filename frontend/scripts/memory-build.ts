import { createHash } from "node:crypto";
import type { Page, Route } from "playwright";
import { z } from "zod";
import { shouldGuardApiRequest } from "../src/test/api-request-policy";

const SHA256 = /^[a-f0-9]{64}$/u;
const REVISION = /^[a-f0-9]{40}$/u;
// The pre-paint initializer is copied verbatim, not emitted with a chunk hash.
// It still needs an exact producer-supplied content hash like every script.
const ASSET_PATH =
  /^\/(?:theme-init\.js|static\/[a-zA-Z0-9_/-]+\.[a-zA-Z0-9_.-]+\.(?:js|css))$/u;
const MAX_BUILD_ID_LENGTH = 200;
const MAX_ASSETS = 1000;
const MAX_ERRORS = 20;
const MAX_ERROR_LENGTH = 1000;
const REQUEST_TIMEOUT_MS = 10_000;
const memoryBuildSchema = z.strictObject({
  mode: z.literal("production"),
  revision: z.string().regex(REVISION),
  buildId: z.string().trim().min(1).max(MAX_BUILD_ID_LENGTH),
  entrySha256: z.string().regex(SHA256),
  assets: z
    .record(z.string().regex(ASSET_PATH), z.string().regex(SHA256))
    .refine(
      (assets) =>
        Object.keys(assets).length > 0 &&
        Object.keys(assets).length <= MAX_ASSETS,
      "Expected 1–1000 production asset hashes"
    ),
});
type MemoryBuild = z.infer<typeof memoryBuildSchema>;
function memorySha256(body: string | Buffer): string {
  return createHash("sha256").update(body).digest("hex");
}

async function verifyAsset(page: Page, url: string, hash: string) {
  const response = await page.request.get(url, {
    maxRedirects: 0,
    timeout: REQUEST_TIMEOUT_MS,
  });
  try {
    if (!response.ok() || memorySha256(await response.body()) !== hash) {
      throw new Error(
        `Production bytes changed or are missing: ${new URL(url).pathname}`
      );
    }
  } finally {
    await response.dispose();
  }
}

async function fulfillIdentifiedAsset(route: Route, expected: string) {
  const response = await route.fetch({
    maxRedirects: 0,
    maxRetries: 0,
    timeout: REQUEST_TIMEOUT_MS,
  });
  try {
    const body = await response.body();
    if (!response.ok() || memorySha256(body) !== expected) {
      throw new Error(
        `Production build identity mismatch: ${new URL(route.request().url()).pathname}`
      );
    }
    await route.fulfill({ response, body });
  } finally {
    await response.dispose();
  }
}

function deniedRequest(route: Route, origin: string): string | undefined {
  const request = route.request();
  const url = new URL(request.url());
  if (
    shouldGuardApiRequest({
      apiBaseUrl: "http://localhost:8080",
      url: request.url(),
      method: request.method(),
      headers: request.headers(),
    })
  ) {
    return `Unmocked RPC: ${url.pathname}`;
  }
  if (url.origin !== origin || request.method() !== "GET") {
    return "Unexpected request outside the synthetic fixture origin";
  }
  return undefined;
}

/** Installed before fixture routes. Unknown RPCs fail rather than reaching a server. */
async function guardMemoryBuild(
  page: Page,
  origin: string,
  build: MemoryBuild
) {
  const errors: string[] = [];
  const loadedAssets = new Set<string>();
  const recordError = (message: string) => {
    if (errors.length < MAX_ERRORS) {
      errors.push(message.slice(0, MAX_ERROR_LENGTH));
    }
  };
  const reject = async (route: Route, message: string) => {
    recordError(message);
    await route.abort("blockedbyclient");
  };
  await page.context().routeWebSocket("**/*", async (socket) => {
    recordError("Unmocked WebSocket: no socket fixtures are declared");
    await socket.close({ reason: "No synthetic socket fixture" });
  });
  async function serveAsset(route: Route) {
    const request = route.request();
    const url = new URL(request.url());
    const expected =
      request.resourceType() === "document"
        ? build.entrySha256
        : build.assets[url.pathname];
    if (expected === undefined) {
      await reject(route, `Unidentified production asset: ${url.pathname}`);
      return;
    }
    try {
      await fulfillIdentifiedAsset(route, expected);
      if (request.resourceType() !== "document") {
        loadedAssets.add(url.pathname);
      }
    } catch (error: unknown) {
      await reject(route, `Build collection failed: ${String(error)}`);
    }
  }
  await page.context().route("**/*", async (route) => {
    const denial = deniedRequest(route, origin);
    if (denial !== undefined) {
      await reject(route, denial);
      return;
    }
    if (
      ["document", "script", "stylesheet"].includes(
        route.request().resourceType()
      )
    ) {
      await serveAsset(route);
      return;
    }
    // Do not allow an unverified font/image response to redirect outside the fixture origin.
    const response = await route.fetch({
      maxRedirects: 0,
      maxRetries: 0,
      timeout: REQUEST_TIMEOUT_MS,
    });
    try {
      if (!response.ok()) {
        await reject(
          route,
          `Fixture resource failed: ${new URL(route.request().url()).pathname}`
        );
        return;
      }
      await route.fulfill({ response });
    } finally {
      await response.dispose();
    }
  });
  return {
    errors,
    loadedAssets,
    async verifyUnchanged() {
      // Serial requests bound pressure without overlapping the measurement phase.
      await Object.entries(build.assets).reduce(
        async (previous, [pathname, hash]) => {
          await previous;
          await verifyAsset(page, `${origin}${pathname}`, hash);
        },
        Promise.resolve()
      );
      await verifyAsset(page, origin, build.entrySha256);
      if (errors.length > 0) {
        throw new Error(errors.join("; "));
      }
    },
  };
}

export type { MemoryBuild };
export { guardMemoryBuild, memoryBuildSchema, memorySha256 };
