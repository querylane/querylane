import { describe, expect, test } from "@rstest/core";
import { paginateAllWithLastResponse, paginateUpTo } from "@/lib/paginate-all";

interface FakePage {
  items: string[];
  nextPageToken?: string;
}

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

describe("paginateAllWithLastResponse", () => {
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

describe("paginateUpTo", () => {
  test("stops at the row cap and reports remaining server results", async () => {
    const pager = fakePaginator([
      { items: ["a", "b"], nextPageToken: "tok1" },
      { items: ["c", "d"], nextPageToken: "tok2" },
      { items: ["e"], nextPageToken: "" },
    ]);

    const result = await paginateUpTo(3, pager.load, select);

    expect(result.items).toEqual(["a", "b", "c"]);
    expect(result.truncated).toBe(true);
    expect(result.lastResponse).toEqual({
      items: ["c", "d"],
      nextPageToken: "tok2",
    });
    expect(pager.calls()).toBe(2);
  });

  test("reports a complete result when the endpoint ends below the cap", async () => {
    const result = await paginateUpTo(
      3,
      async () => ({ items: ["a", "b"], nextPageToken: "" }),
      select
    );

    expect(result).toEqual({
      items: ["a", "b"],
      lastResponse: { items: ["a", "b"], nextPageToken: "" },
      truncated: false,
    });
  });
});
