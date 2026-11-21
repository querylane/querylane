import { expect, test } from "playwright/test";
import { collectMemory } from "../../scripts/memory-collector";

const OPTIONS = {
  warmupCycles: 1,
  sampleCount: 5,
  cyclesPerSample: 1,
  timeoutMs: 20_000,
};

test("real detached-node/listener retention is detected; removing retention plateaus in the same document", async ({
  page,
}, testInfo) => {
  await page.setContent(
    "<!doctype html><title>Synthetic collector sensitivity</title><main>Synthetic collector sensitivity, not the application</main>"
  );
  const state = await page.evaluateHandle(() => {
    const browserWindow = document.defaultView;
    if (!browserWindow) {
      throw new Error("Browser window unavailable");
    }
    const intervals: number[] = [];
    return {
      roundTrip(retain: boolean) {
        const nodes = Array.from({ length: 128 }, () => {
          const node = document.createElement("div");
          node.textContent = "Detached sensitivity allocation";
          node.addEventListener("memory-control", () =>
            node.toggleAttribute("data-probe")
          );
          document.body.append(node);
          node.remove();
          return node;
        });
        if (retain) {
          intervals.push(
            browserWindow.setInterval(() => {
              for (const node of nodes) {
                node.toggleAttribute("data-tick");
              }
            }, 60_000)
          );
        }
      },
      release() {
        for (const interval of intervals) {
          clearInterval(interval);
        }
        intervals.length = 0;
      },
    };
  });
  try {
    const retained = await collectMemory(
      page,
      () =>
        state.evaluate((control) => {
          control.roundTrip(true);
        }),
      { ...OPTIONS, control: "retained-dom" }
    );
    await testInfo.attach("retained-control", {
      body: JSON.stringify(retained),
      contentType: "application/json",
    });
    expect(retained.analysis.status, JSON.stringify(retained)).toBe(
      "suspected-growth"
    );
    expect(retained.analysis.metrics.nodes?.delta).toBeGreaterThanOrEqual(512);
    expect(retained.analysis.metrics.listeners?.delta).toBeGreaterThanOrEqual(
      512
    );
    await state.evaluate((control) => {
      control.release();
    });
    const released = await collectMemory(
      page,
      () =>
        state.evaluate((control) => {
          control.roundTrip(false);
        }),
      { ...OPTIONS, control: "released-dom" }
    );
    await testInfo.attach("released-control", {
      body: JSON.stringify(released),
      contentType: "application/json",
    });
    expect(released.analysis.blocking, JSON.stringify(released)).toBe(false);
    expect(released.analysis.metrics.nodes?.spread).toBe(0);
    expect(released.analysis.metrics.listeners?.spread).toBe(0);
    expect(released.samples[0]?.documentId).toBe(
      retained.samples[0]?.documentId
    );
    const disabled = await collectMemory(
      page,
      () =>
        state.evaluate((control) => {
          control.roundTrip(false);
        }),
      { ...OPTIONS, control: "retained-dom" }
    );
    expect(disabled.analysis.status).toBe("negative-control-failed");
  } finally {
    await state.evaluate((control) => {
      control.release();
    });
    await state.dispose();
  }
});

test("reload invalidates real collection instead of resetting retained resources", async ({
  page,
}) => {
  await page.goto("about:blank");
  const report = await collectMemory(
    page,
    async () => {
      await page.reload();
    },
    OPTIONS
  );
  expect(report.analysis.status).toBe("invalid-collection");
  expect(report.analysis.errors.join(" ")).toContain("Document reloaded");
});

test("runtime and journey failures remain visible", async ({ page }) => {
  const report = await collectMemory(
    page,
    () => Promise.reject(new Error("Semantic readiness failed")),
    OPTIONS
  );
  expect(report.analysis.status).toBe("invalid-collection");
  expect(report.analysis.errors).toContain("Semantic readiness failed");
});

test("collection deadline bounds even a stalled journey and closes its page", async ({
  page,
}) => {
  const report = await collectMemory(
    page,
    async () => {
      await new Promise<void>(() => {
        /* Deliberately unresolved test driver. */
      });
    },
    { ...OPTIONS, timeoutMs: 1000 }
  );
  expect(report.analysis.status).toBe("invalid-collection");
  expect(report.analysis.errors.join(" ")).toContain(
    "Collection deadline exceeded"
  );
  expect(page.isClosed()).toBe(true);
});

test("dedicated worker counts come from live browser workers", async ({
  page,
}) => {
  const worker = await page.evaluateHandle(async () => {
    const url = URL.createObjectURL(
      new Blob(['postMessage("ready");'], { type: "text/javascript" })
    );
    const created = new Worker(url);
    await new Promise<void>((resolve, reject) => {
      created.addEventListener(
        "message",
        () => {
          URL.revokeObjectURL(url);
          resolve();
        },
        { once: true }
      );
      created.addEventListener(
        "error",
        (event) => {
          URL.revokeObjectURL(url);
          reject(new Error(event.message));
        },
        { once: true }
      );
    });
    return created;
  });
  try {
    const report = await collectMemory(
      page,
      async () => {
        await page.evaluate(() => document.title);
      },
      OPTIONS
    );
    expect(report.analysis.blocking).toBe(false);
    expect(report.analysis.metrics.dedicatedWorkers).toMatchObject({
      min: 1,
      max: 1,
      count: 5,
    });
    expect(report.unsupported.serviceWorkers).toBe("Not counted");
  } finally {
    await worker.evaluate((value) => {
      value.terminate();
    });
    await worker.dispose();
  }
});
