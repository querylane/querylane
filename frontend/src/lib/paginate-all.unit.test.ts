import { describe, expect, test } from "vitest";
import { paginateAll, paginateAllWithLastResponse } from "@/lib/paginate-all";

interface FakePage {
  items: string[];
  nextPageToken?: string;
}

const TOTAL_PAGES = 3;

const select = (r: FakePage) => r.items;

function fakePaginator(pages: FakePage[]) {
  let call = 0;
  return {
    calls: () => call,
    load: () => {
      const page = pages[call];
      call += 1;
      return Promise.resolve(page ?? { items: [] });
    },
  };
}

describe("paginateAll", () => {
  test("single page with empty nextPageToken", async () => {
    const result = await paginateAll(
      async () => ({ items: ["a", "b"], nextPageToken: "" }),
      select
    );
    expect(result).toEqual(["a", "b"]);
  });

  test("single page with undefined nextPageToken", async () => {
    const result = await paginateAll(async () => ({ items: ["x"] }), select);
    expect(result).toEqual(["x"]);
  });

  test("multiple pages with token progression", async () => {
    const pager = fakePaginator([
      { items: ["a"], nextPageToken: "tok1" },
      { items: ["b"], nextPageToken: "tok2" },
      { items: ["c"], nextPageToken: "" },
    ]);
    const result = await paginateAll(pager.load, select);
    expect(result).toEqual(["a", "b", "c"]);
    expect(pager.calls()).toBe(TOTAL_PAGES);
  });

  test("items accumulated across pages", async () => {
    const pager = fakePaginator([
      { items: ["a", "b"], nextPageToken: "p2" },
      { items: ["c", "d", "e"], nextPageToken: "" },
    ]);
    const result = await paginateAll(pager.load, select);
    expect(result).toEqual(["a", "b", "c", "d", "e"]);
  });

  test("empty first page", async () => {
    const result = await paginateAll(
      async () => ({ items: [], nextPageToken: "" }),
      select
    );
    expect(result).toEqual([]);
  });

  test("duplicate token is reported as a pagination error", async () => {
    let call = 0;
    await expect(
      paginateAll(() => {
        call += 1;
        return Promise.resolve({
          items: [`item${call}`],
          nextPageToken: "stuck",
        });
      }, select)
    ).rejects.toThrow("pagination returned a repeated next page token");
    expect(call).toBe(2);
  });

  test("preserves opaque nextPageToken whitespace", async () => {
    const calls: Array<string | undefined> = [];
    const result = await paginateAll((pageToken) => {
      calls.push(pageToken);
      return Promise.resolve(
        pageToken === undefined
          ? { items: ["a"], nextPageToken: " token " }
          : { items: ["b"], nextPageToken: "" }
      );
    }, select);
    expect(calls).toEqual([undefined, " token "]);
    expect(result).toEqual(["a", "b"]);
  });

  test("error propagation from loadPage", async () => {
    await expect(
      paginateAll(() => {
        throw new Error("network failure");
      }, select)
    ).rejects.toThrow("network failure");
  });

  test("error on second page propagates", async () => {
    let call = 0;
    await expect(
      paginateAll(() => {
        call += 1;
        if (call === 2) {
          throw new Error("page 2 failed");
        }
        return Promise.resolve({ items: ["a"], nextPageToken: "next" });
      }, select)
    ).rejects.toThrow("page 2 failed");
  });
});

describe("paginateAllWithLastResponse", () => {
  test("returns accumulated items and the final page response", async () => {
    const pager = fakePaginator([
      { items: ["a"], nextPageToken: "tok1" },
      { items: ["b"], nextPageToken: "" },
    ]);

    const result = await paginateAllWithLastResponse(pager.load, select);

    expect(result.items).toEqual(["a", "b"]);
    expect(result.lastResponse).toEqual({ items: ["b"], nextPageToken: "" });
  });

  test("throws on duplicate token instead of returning partial data", async () => {
    let call = 0;

    await expect(
      paginateAllWithLastResponse(() => {
        call += 1;
        return Promise.resolve({
          items: [`item${call}`],
          nextPageToken: "stuck",
        });
      }, select)
    ).rejects.toThrow("pagination returned a repeated next page token");
  });
});
