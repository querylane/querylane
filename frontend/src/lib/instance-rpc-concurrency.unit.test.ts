import { create } from "@bufbuild/protobuf";
import {
  createContextValues,
  type UnaryRequest,
  type UnaryResponse,
} from "@connectrpc/connect";
import { describe, expect, it } from "vitest";

import {
  createInstanceRpcConcurrencyInterceptor,
  createKeyedRpcSemaphore,
  extractInstanceScopeKey,
} from "@/lib/instance-rpc-concurrency";
import {
  ConsoleService,
  GetConsoleConfigRequestSchema,
  type GetConsoleConfigResponseSchema,
} from "@/protogen/querylane/console/v1alpha1/console_pb";
import {
  ListSchemasRequestSchema,
  ListSchemasResponseSchema,
  SchemaService,
} from "@/protogen/querylane/console/v1alpha1/schema_pb";

function createListSchemasRequest(
  parent: string
): UnaryRequest<
  typeof ListSchemasRequestSchema,
  typeof ListSchemasResponseSchema
> {
  return {
    contextValues: createContextValues(),
    header: new Headers(),
    message: create(ListSchemasRequestSchema, { parent }),
    method: SchemaService.method.listSchemas,
    requestMethod: "POST",
    service: SchemaService,
    signal: new AbortController().signal,
    stream: false,
    url: "http://localhost:8080/querylane.console.v1alpha1.SchemaService/ListSchemas",
  };
}

function createListSchemasResponse(): UnaryResponse<
  typeof ListSchemasRequestSchema,
  typeof ListSchemasResponseSchema
> {
  return {
    header: new Headers(),
    message: create(ListSchemasResponseSchema),
    method: SchemaService.method.listSchemas,
    service: SchemaService,
    stream: false,
    trailer: new Headers(),
  };
}

function createConsoleConfigRequest(): UnaryRequest<
  typeof GetConsoleConfigRequestSchema,
  typeof GetConsoleConfigResponseSchema
> {
  return {
    contextValues: createContextValues(),
    header: new Headers(),
    message: create(GetConsoleConfigRequestSchema),
    method: ConsoleService.method.getConsoleConfig,
    requestMethod: "POST",
    service: ConsoleService,
    signal: new AbortController().signal,
    stream: false,
    url: "http://localhost:8080/querylane.console.v1alpha1.ConsoleService/GetConsoleConfig",
  };
}

describe("extractInstanceScopeKey", () => {
  it("extracts the instance prefix from name and parent fields", () => {
    expect(
      extractInstanceScopeKey({ name: "instances/neon-1/databases/app" })
    ).toBe("instances/neon-1");
    expect(
      extractInstanceScopeKey({ parent: "instances/local/databases/demo" })
    ).toBe("instances/local");
  });

  it("prefers name over parent when both are present", () => {
    expect(
      extractInstanceScopeKey({
        name: "instances/a/databases/x",
        parent: "instances/b",
      })
    ).toBe("instances/a");
  });

  it("returns null for non-instance resources and invalid messages", () => {
    expect(extractInstanceScopeKey({ name: "users/1" })).toBe(null);
    expect(extractInstanceScopeKey({ parent: 42 })).toBe(null);
    expect(extractInstanceScopeKey({})).toBe(null);
    expect(extractInstanceScopeKey(null)).toBe(null);
    expect(extractInstanceScopeKey("instances/a")).toBe(null);
  });
});

describe("createKeyedRpcSemaphore", () => {
  it("runs requests immediately below the limit and queues beyond it", async () => {
    const semaphore = createKeyedRpcSemaphore(2);

    const releaseFirst = await semaphore.acquire("instances/a");
    const releaseSecond = await semaphore.acquire("instances/a");

    let thirdAcquired = false;
    const thirdAcquire = semaphore.acquire("instances/a").then((release) => {
      thirdAcquired = true;
      return release;
    });

    await Promise.resolve();
    expect(thirdAcquired).toBe(false);

    releaseFirst();
    const releaseThird = await thirdAcquire;
    expect(thirdAcquired).toBe(true);

    releaseSecond();
    releaseThird();
  });

  it("tracks limits per key independently", async () => {
    const semaphore = createKeyedRpcSemaphore(1);

    const releaseA = await semaphore.acquire("instances/a");
    const releaseB = await semaphore.acquire("instances/b");

    releaseA();
    releaseB();
  });

  it("drains the queue in order as slots free up", async () => {
    const semaphore = createKeyedRpcSemaphore(1);
    const order: number[] = [];

    const releaseFirst = await semaphore.acquire("instances/a");
    const second = semaphore.acquire("instances/a").then((release) => {
      order.push(2);
      return release;
    });
    const third = semaphore.acquire("instances/a").then((release) => {
      order.push(3);
      return release;
    });

    releaseFirst();
    const releaseSecond = await second;
    releaseSecond();
    const releaseThird = await third;
    releaseThird();

    expect(order).toEqual([2, 3]);
  });

  it("rejects queued acquisitions when their signal aborts", async () => {
    const semaphore = createKeyedRpcSemaphore(1);
    const controller = new AbortController();
    const abortReason = new Error("aborted while queued");

    const releaseFirst = await semaphore.acquire("instances/a");
    const queued = semaphore.acquire("instances/a", controller.signal);

    controller.abort(abortReason);
    await expect(queued).rejects.toBe(abortReason);

    // The aborted waiter must not consume the freed slot.
    releaseFirst();
    const releaseNext = await semaphore.acquire("instances/a");
    releaseNext();
  });

  it("rejects immediately when the signal is already aborted", async () => {
    const semaphore = createKeyedRpcSemaphore(1);
    const controller = new AbortController();
    const abortReason = new Error("already aborted");
    controller.abort(abortReason);

    await expect(
      semaphore.acquire("instances/a", controller.signal)
    ).rejects.toBe(abortReason);
  });
});

describe("createInstanceRpcConcurrencyInterceptor", () => {
  it("caps concurrent unary requests per instance and drains the queue", async () => {
    const interceptor = createInstanceRpcConcurrencyInterceptor(1);
    let inFlight = 0;
    let maxInFlight = 0;
    const releases: Array<() => void> = [];
    const next = () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      return new Promise<ReturnType<typeof createListSchemasResponse>>(
        (resolve) => {
          releases.push(() => {
            inFlight -= 1;
            resolve(createListSchemasResponse());
          });
        }
      );
    };

    const first = interceptor(next)(
      createListSchemasRequest("instances/neon/databases/app")
    );
    const second = interceptor(next)(
      createListSchemasRequest("instances/neon/databases/app")
    );

    await Promise.resolve();
    expect(maxInFlight).toBe(1);
    expect(releases).toHaveLength(1);

    releases[0]?.();
    await first;
    // Queued request dispatches once the first releases its slot.
    await Promise.resolve();
    expect(releases).toHaveLength(2);

    releases[1]?.();
    await second;
    expect(maxInFlight).toBe(1);
  });

  it("does not gate requests for different instances against each other", async () => {
    const interceptor = createInstanceRpcConcurrencyInterceptor(1);
    let inFlight = 0;
    let maxInFlight = 0;
    const releases: Array<() => void> = [];
    const next = () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      return new Promise<ReturnType<typeof createListSchemasResponse>>(
        (resolve) => {
          releases.push(() => {
            inFlight -= 1;
            resolve(createListSchemasResponse());
          });
        }
      );
    };

    const first = interceptor(next)(
      createListSchemasRequest("instances/a/databases/x")
    );
    const second = interceptor(next)(
      createListSchemasRequest("instances/b/databases/y")
    );

    await Promise.resolve();
    expect(maxInFlight).toBe(2);

    for (const release of releases) {
      release();
    }
    await Promise.all([first, second]);
  });

  it("bypasses meta-database services entirely", async () => {
    const interceptor = createInstanceRpcConcurrencyInterceptor(0);
    let called = 0;
    const next = () => {
      called += 1;
      return Promise.resolve(createListSchemasResponse());
    };

    // Limit 0 would queue any gated request forever; the console request
    // must pass straight through.
    await interceptor(next)(createConsoleConfigRequest());
    expect(called).toBe(1);
  });
});
