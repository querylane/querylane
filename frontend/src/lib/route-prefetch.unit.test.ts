import { expect, rs, test } from "@rstest/core";
import { QueryClient } from "@tanstack/react-query";
import { prefetchRouteQuery } from "@/lib/route-prefetch";

test("prefetch reuses fresh data and refetches invalidated data", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: Number.POSITIVE_INFINITY } },
  });
  const queryFn = rs.fn(async () => "rows");
  const options = { queryFn, queryKey: ["prefetch-rows"], staleTime: 60_000 };

  try {
    await expect(prefetchRouteQuery(client, options)).resolves.toBeUndefined();
    await prefetchRouteQuery(client, options);
    expect(queryFn).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(options.queryKey)).toBe("rows");

    await client.invalidateQueries({ queryKey: options.queryKey });
    await prefetchRouteQuery(client, options);
    expect(queryFn).toHaveBeenCalledTimes(2);
  } finally {
    client.clear();
  }
});

test("failed prefetch retains its error for observers and permits retry", async () => {
  const client = new QueryClient({
    defaultOptions: {
      queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
    },
  });
  const error = new Error("Offline");
  const queryFn = rs
    .fn<() => Promise<string>>()
    .mockRejectedValueOnce(error)
    .mockResolvedValue("recovered");
  const options = { queryFn, queryKey: ["prefetch-retry"] };

  try {
    await expect(prefetchRouteQuery(client, options)).resolves.toBeUndefined();
    expect(client.getQueryState(options.queryKey)).toMatchObject({
      error,
      status: "error",
    });
    await prefetchRouteQuery(client, options);
    expect(client.getQueryData(options.queryKey)).toBe("recovered");
    expect(queryFn).toHaveBeenCalledTimes(2);
  } finally {
    client.clear();
  }
});
