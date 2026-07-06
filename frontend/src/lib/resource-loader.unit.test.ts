import { describe, expect, test, vi } from "vitest";
import { logger } from "@/lib/diagnostics";
import { createResourceLoader } from "./resource-loader";

vi.mock("@/lib/diagnostics", () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    fmt: vi.fn(),
    info: vi.fn(),
    trace: vi.fn(),
    warn: vi.fn(),
  },
}));

function makeMockQuery<T = undefined>(
  overrides: Partial<{
    data: T;
    error: unknown;
    isFetching: boolean;
    isPending: boolean;
    refetch: () => Promise<unknown>;
  }> = {}
) {
  return {
    data: undefined as T | undefined,
    error: null as unknown,
    isFetching: false,
    isPending: true,
    refetch: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
}

describe("createResourceLoader", () => {
  test("returns pending state when query is loading", () => {
    const query = makeMockQuery({ isPending: true });
    const loader = createResourceLoader(query, "console.instance");

    expect(loader.isPending).toBe(true);
    expect(loader.hasData).toBe(false);
    expect(loader.data).toBeUndefined();
    expect(loader.error).toBeNull();
  });

  test("returns data when query succeeds", () => {
    const data = { instance: { name: "test" } };
    const query = makeMockQuery({
      data,
      isPending: false,
    });
    const loader = createResourceLoader(query, "console.instance");

    expect(loader.isPending).toBe(false);
    expect(loader.hasData).toBe(true);
    expect(loader.data).toBe(data);
  });

  test("returns error when query fails", () => {
    const error = new Error("fetch failed");
    const query = makeMockQuery({
      error,
      isPending: false,
    });
    const loader = createResourceLoader(query, "console.instance");

    expect(loader.error).toBe(error);
    expect(loader.hasData).toBe(false);
  });

  test("retry handler logs failures and resolves", async () => {
    const retryError = new Error("retry failed");
    const refetch = vi.fn(() => Promise.reject(retryError));
    const query = makeMockQuery({ refetch });
    const loader = createResourceLoader(query, "console.instance");

    await expect(loader.retry()).resolves.toBeUndefined();

    expect(refetch).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith("Query action failed", {
      action: "retry",
      area: "console.instance",
      errorMessage: "retry failed",
    });
  });

  test("retry handler resolves when refetch succeeds", async () => {
    const refetch = vi.fn(() => Promise.resolve({ data: {} }));
    const query = makeMockQuery({ refetch });
    const loader = createResourceLoader(query, "console.instance");

    await loader.retry();
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  test("pageStateProps contains correct area", () => {
    const query = makeMockQuery();
    const loader = createResourceLoader(query, "console.database");

    expect(loader.pageStateProps.area).toBe("console.database");
  });

  test("pageStateProps maps query state to ResourcePageState props", () => {
    const error = new Error("fail");
    const refetch = vi.fn(() => Promise.resolve());
    const query = makeMockQuery({
      data: { db: "test" },
      error,
      isPending: false,
      refetch,
    });
    const loader = createResourceLoader(query, "console.database");

    expect(loader.pageStateProps).toEqual({
      area: "console.database",
      error,
      hasData: true,
      loading: false,
      retry: expect.any(Function),
    });
  });

  test("pageStateProps.hasData is false when data is undefined", () => {
    const query = makeMockQuery({ data: undefined, isPending: false });
    const loader = createResourceLoader(query, "console.schema");

    expect(loader.pageStateProps.hasData).toBe(false);
  });

  test("pageStateProps.hasData is false when data is null", () => {
    const query = makeMockQuery({ data: null, isPending: false });
    const loader = createResourceLoader(query, "console.schema");

    expect(loader.pageStateProps.hasData).toBe(false);
  });

  test("isFetching reflects query state", () => {
    const query = makeMockQuery({ isFetching: true, isPending: false });
    const loader = createResourceLoader(query, "console.table");

    expect(loader.isFetching).toBe(true);
  });
});
