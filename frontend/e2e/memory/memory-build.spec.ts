import { once } from "node:events";
import { createServer } from "node:http";
import { expect, test } from "playwright/test";
import {
  guardMemoryBuild,
  memoryBuildSchema,
  memorySha256,
} from "../../scripts/memory-build";

// Disposable transport fixture. Never a substitute for the production application.
test("build guard exercises verified bytes, rejects reload-time asset drift and denies missing RPC fixtures", async ({
  page,
}) => {
  let script = 'document.title = "Synthetic transport fixture";';
  const entry =
    '<!doctype html><title>Synthetic transport fixture</title><script src="/theme-init.js"></script><script src="/static/js/main.fixture.js"></script>';
  const requests: string[] = [];
  const server = createServer((request, response) => {
    requests.push(request.url ?? "");
    response.writeHead(200, {
      "Content-Type":
        request.url?.endsWith(".js") === true ? "text/javascript" : "text/html",
    });
    response.end(request.url?.endsWith(".js") === true ? script : entry);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Synthetic transport fixture address unavailable");
    }
    const origin = `http://127.0.0.1:${address.port}`;
    const build = memoryBuildSchema.parse({
      mode: "production",
      revision: "1".repeat(40),
      buildId: "synthetic-transport-control-not-app",
      entrySha256: memorySha256(entry),
      assets: {
        "/theme-init.js": memorySha256(script),
        "/static/js/main.fixture.js": memorySha256(script),
      },
    });
    const guard = await guardMemoryBuild(page, origin, build);
    await guard.verifyUnchanged();
    await page.goto(origin);
    await expect(page).toHaveTitle("Synthetic transport fixture");
    expect(guard.loadedAssets).toEqual(
      new Set(["/theme-init.js", "/static/js/main.fixture.js"])
    );
    script = 'document.title = "Mutated transport fixture";';
    await expect(guard.verifyUnchanged()).rejects.toThrow(
      "Production bytes changed or are missing"
    );
    const rpcDenied = await page.evaluate(async () => {
      try {
        await fetch("/fixture.Service/Missing", {
          method: "POST",
          headers: {
            "connect-protocol-version": "1",
            "content-type": "application/proto",
          },
          body: "fixture",
        });
        return false;
      } catch {
        return true;
      }
    });
    expect(rpcDenied).toBe(true);
    expect(requests).not.toContain("/fixture.Service/Missing");
    expect(guard.errors).toContain("Unmocked RPC: /fixture.Service/Missing");
    const socketClosed = await page.evaluate(
      async (url) =>
        await new Promise<boolean>((resolve) => {
          const socket = new WebSocket(url);
          socket.addEventListener(
            "close",
            () => {
              resolve(true);
            },
            { once: true }
          );
        }),
      `${origin.replace("http:", "ws:")}/fixture-socket`
    );
    expect(socketClosed).toBe(true);
    expect(guard.errors).toContain(
      "Unmocked WebSocket: no socket fixtures are declared"
    );
    expect(requests).not.toContain("/fixture-socket");
    // Browser cache must not conceal changed assets on a fresh document request.
    await page.reload();
    expect(guard.errors.join(" ")).toContain(
      "Production build identity mismatch"
    );
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }
});
