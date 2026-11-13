import { performance } from "node:perf_hooks";
import type { CDPSession, Page } from "playwright";
import {
  analyzeMemory,
  MAX_MEMORY_SAMPLES,
  type MemoryAnalysisOptions,
  type MemorySample,
  MIN_MEMORY_SAMPLES,
} from "./memory-detector";

const MAX_WARMUP_CYCLES = 100;
const MAX_CYCLES_PER_SAMPLE = 100;
const MIN_TIMEOUT_MS = 1000;
const MAX_TIMEOUT_MS = 600_000;
const MAX_TOTAL_CYCLES = 1000;
const MAX_ERRORS = 20;
const MAX_ERROR_LENGTH = 1000;

async function sequentialCycles(
  count: number,
  step: (cycle: number) => Promise<void>
) {
  await Array.from({ length: count }, (_, index) => index + 1).reduce(
    async (previous, cycle) => {
      await previous;
      await step(cycle);
    },
    Promise.resolve()
  );
}

export interface MemoryCollectionOptions {
  cyclesPerSample: number;
  sampleCount: number;
  timeoutMs: number;
  warmupCycles: number;
}
export const DEFAULT_MEMORY_OPTIONS: MemoryCollectionOptions = {
  warmupCycles: 5,
  sampleCount: 6,
  cyclesPerSample: 5,
  timeoutMs: 180_000,
};
export function validateMemoryOptions(options: MemoryCollectionOptions): void {
  for (const [name, value, min, max] of [
    ["warmupCycles", options.warmupCycles, 1, MAX_WARMUP_CYCLES],
    [
      "sampleCount",
      options.sampleCount,
      MIN_MEMORY_SAMPLES,
      MAX_MEMORY_SAMPLES,
    ],
    ["cyclesPerSample", options.cyclesPerSample, 1, MAX_CYCLES_PER_SAMPLE],
    ["timeoutMs", options.timeoutMs, MIN_TIMEOUT_MS, MAX_TIMEOUT_MS],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < min || value > max) {
      throw new Error(`${name} must be an integer in ${min}–${max}`);
    }
  }
  if (
    options.warmupCycles + (options.sampleCount - 1) * options.cyclesPerSample >
    MAX_TOTAL_CYCLES
  ) {
    throw new Error("Collection exceeds the 1000 round-trip lifetime bound");
  }
}

export const MEMORY_LIMITATIONS = [
  "GC is requested twice at each checkpoint, not guaranteed complete.",
  "Directional sustained growth is informational; no repeated production baseline or calibrated budget exists.",
  "Renderer counters include detached nodes and renderer-wide noise, not ownership or retaining paths.",
  "Heap excludes native, GPU, driver, worker heaps and other processes.",
  "Dedicated workers count only page-owned workers; service/shared worker counts are unsupported, not zero.",
  "Timers/subscriptions are unsupported by this method; async-resource diagnostics are separate and MESSAGEPORT reports remain visible.",
  "Fixed identities and warmup reduce cache churn; real timers remain active and fixed Date does not compress time.",
];

/** The caller owns the context/browser. This collector owns CDP/listeners and may close its page on deadline. */
export async function collectMemory(
  page: Page,
  roundTrip: () => Promise<void>,
  options: MemoryCollectionOptions & Pick<MemoryAnalysisOptions, "control">
) {
  validateMemoryOptions(options);
  const started = performance.now();
  const samples: MemorySample[] = [];
  const errors: string[] = [];
  let session: CDPSession | undefined;
  let protocol:
    | {
        protocolVersion: string;
        product: string;
        revision: string;
        userAgent: string;
        jsVersion: string;
      }
    | undefined;
  let initialLoader: string | undefined;
  let reloaded = false;
  let stopNavigation: (() => void) | undefined;
  let timedOut = false;
  const addError = (message: string) => {
    if (errors.length < MAX_ERRORS) {
      errors.push(message.slice(0, MAX_ERROR_LENGTH));
    }
  };
  const onPageError = (error: Error) => {
    addError(`Page error: ${error.message}`);
  };
  const onCrash = () => {
    addError("Page crashed");
  };
  page.on("pageerror", onPageError);
  page.on("crash", onCrash);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let deadlineClose: Promise<void> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      timedOut = true;
      addError("Collection deadline exceeded");
      reject(new Error("Collection deadline exceeded"));
      deadlineClose = page.close().catch((error: unknown) => {
        addError(`Deadline cleanup failed: ${String(error)}`);
      });
    }, options.timeoutMs);
  });
  const execute = async () => {
    const client = await page.context().newCDPSession(page);
    session = client;
    await client.send("Page.enable");
    await client.send("Performance.enable");
    protocol = await client.send("Browser.getVersion");
    const initial = await client.send("Page.getFrameTree");
    initialLoader = initial.frameTree.frame.loaderId;
    const onFrameNavigation = (event: { frame: { id: string } }) => {
      if (event.frame.id === initial.frameTree.frame.id) {
        reloaded = true;
      }
    };
    client.on("Page.frameNavigated", onFrameNavigation);
    stopNavigation = () => {
      client.off("Page.frameNavigated", onFrameNavigation);
    };
    const assertSameDocument = async () => {
      const current = await client.send("Page.getFrameTree");
      if (reloaded || current.frameTree.frame.loaderId !== initialLoader) {
        throw new Error("Document reloaded: collection is not a SPA lifecycle");
      }
      if (timedOut || errors.length > 0) {
        throw new Error(
          "Collection invalidated by a runtime error or deadline"
        );
      }
    };
    const sample = async (cycle: number) => {
      await assertSameDocument();
      await page.requestGC();
      await page.requestGC();
      const [{ metrics }, counters] = await Promise.all([
        client.send("Performance.getMetrics"),
        client.send("Memory.getDOMCounters"),
      ]);
      await assertSameDocument();
      samples.push({
        cycle,
        documentId: initialLoader ?? "",
        elapsedMs: performance.now() - started,
        heapBytes:
          metrics.find((metric) => metric.name === "JSHeapUsedSize")?.value ??
          null,
        nodes: counters.nodes,
        listeners: counters.jsEventListeners,
        documents: counters.documents,
        dedicatedWorkers: page.workers().length,
      });
    };
    await sequentialCycles(options.warmupCycles, async () => {
      await roundTrip();
      await assertSameDocument();
    });
    await sample(0);
    const totalCycles = (options.sampleCount - 1) * options.cyclesPerSample;
    await sequentialCycles(totalCycles, async (cycle) => {
      await roundTrip();
      await assertSameDocument();
      if (cycle % options.cyclesPerSample === 0) {
        await sample(cycle);
      }
    });
  };
  try {
    await Promise.race([execute(), deadline]);
  } catch (error: unknown) {
    addError(error instanceof Error ? error.message : String(error));
  } finally {
    clearTimeout(timeout);
    await deadlineClose;
    stopNavigation?.();
    page.off("pageerror", onPageError);
    page.off("crash", onCrash);
    if (session) {
      try {
        await session.detach();
      } catch (error: unknown) {
        addError(`CDP cleanup failed: ${String(error)}`);
      }
    }
  }
  return {
    schemaVersion: 1,
    method: "post-gc-renderer-counters",
    parameters: options,
    protocol: protocol ?? null,
    samples,
    unsupported: {
      timers: "No timer instrumentation",
      subscriptions: "No subscription instrumentation",
      serviceWorkers: "Not counted",
      sharedWorkers: "Not counted",
      workerHeap: "Not sampled",
    },
    limitations: MEMORY_LIMITATIONS,
    analysis: analyzeMemory(samples, {
      ...(options.control ? { control: options.control } : {}),
      errors,
      expectedSamples: options.sampleCount,
    }),
  };
}
