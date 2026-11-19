import type { Interceptor } from "@connectrpc/connect";

const INSTANCE_RPC_CONCURRENCY_LIMIT = 4;

const INSTANCE_SCOPED_SERVICE_TYPE_NAMES: ReadonlySet<string> = new Set([
  "querylane.console.v1alpha1.DatabaseService",
  "querylane.console.v1alpha1.ExtensionService",
  "querylane.console.v1alpha1.RoleService",
  "querylane.console.v1alpha1.SQLService",
  "querylane.console.v1alpha1.SchemaService",
  "querylane.console.v1alpha1.TableDataService",
  "querylane.console.v1alpha1.TableService",
  "querylane.console.v1alpha1.ViewService",
]);

const INSTANCE_RESOURCE_NAME_PATTERN = /^instances\/[^/]+/u;

function extractInstanceScopeKey(message: unknown) {
  if (typeof message !== "object" || message === null) {
    return null;
  }

  const fields = message as { name?: unknown; parent?: unknown };
  for (const value of [fields.name, fields.parent]) {
    if (typeof value === "string") {
      const match = INSTANCE_RESOURCE_NAME_PATTERN.exec(value);
      if (match) {
        return match[0];
      }
    }
  }

  return null;
}

interface QueuedAcquire {
  onDispatch: () => void;
  settled: boolean;
}

interface KeyedRpcSemaphore {
  acquire: (key: string, signal?: AbortSignal) => Promise<() => void>;
}

function abortError(reason: unknown) {
  if (reason instanceof Error) {
    return reason;
  }
  const error = new Error(
    typeof reason === "string" ? reason : "Operation aborted",
    { cause: reason }
  );
  error.name = "AbortError";
  return error;
}

function createKeyedRpcSemaphore(limit: number) {
  const activeCounts = new Map<string, number>();
  const queues = new Map<string, QueuedAcquire[]>();

  function occupySlot(key: string) {
    activeCounts.set(key, (activeCounts.get(key) ?? 0) + 1);
  }

  function dispatchNext(key: string) {
    const queue = queues.get(key);
    if (!queue) {
      return;
    }

    let waiter = queue.shift();
    while (waiter?.settled === true) {
      waiter = queue.shift();
    }
    if (queue.length === 0) {
      queues.delete(key);
    }
    if (!waiter) {
      return;
    }

    waiter.settled = true;
    occupySlot(key);
    waiter.onDispatch();
  }

  function releaseSlot(key: string) {
    const count = activeCounts.get(key) ?? 0;
    if (count <= 1) {
      activeCounts.delete(key);
    } else {
      activeCounts.set(key, count - 1);
    }
    dispatchNext(key);
  }

  function enqueue(key: string, waiter: QueuedAcquire) {
    const queue = queues.get(key);
    if (queue) {
      queue.push(waiter);
      return;
    }
    queues.set(key, [waiter]);
  }

  function acquire(key: string, signal?: AbortSignal) {
    if (signal?.aborted === true) {
      return Promise.reject(abortError(signal.reason));
    }

    if ((activeCounts.get(key) ?? 0) < limit) {
      occupySlot(key);
      return Promise.resolve(() => {
        releaseSlot(key);
      });
    }

    return new Promise<() => void>((resolve, reject) => {
      const waiter: QueuedAcquire = {
        onDispatch: () => {
          signal?.removeEventListener("abort", onAbort);
          resolve(() => {
            releaseSlot(key);
          });
        },
        settled: false,
      };
      const onAbort = () => {
        if (waiter.settled) {
          return;
        }
        waiter.settled = true;
        reject(abortError(signal?.reason));
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      enqueue(key, waiter);
    });
  }

  return { acquire } satisfies KeyedRpcSemaphore;
}

function createInstanceRpcConcurrencyInterceptor() {
  const semaphore = createKeyedRpcSemaphore(INSTANCE_RPC_CONCURRENCY_LIMIT);

  return ((next) => async (req) => {
    if (req.stream) {
      return await next(req);
    }
    if (!INSTANCE_SCOPED_SERVICE_TYPE_NAMES.has(req.service.typeName)) {
      return await next(req);
    }

    const key = extractInstanceScopeKey(req.message);
    if (key === null) {
      return await next(req);
    }

    const release = await semaphore.acquire(key, req.signal);
    try {
      return await next(req);
    } finally {
      release();
    }
  }) satisfies Interceptor;
}

export { createInstanceRpcConcurrencyInterceptor };
