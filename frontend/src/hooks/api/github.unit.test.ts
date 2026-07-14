import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  fetchGithubRepoStars,
  formatGithubStarCount,
  useGithubRepoStarsQuery,
} from "@/hooks/api/github";

const { useQueryMock } = vi.hoisted(() => ({
  useQueryMock: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: useQueryMock,
}));

const STAR_COUNT_999 = 999;
const STAR_COUNT_1249 = 1249;
const STAR_COUNT_1550 = 1550;
const STAR_COUNT_3210 = 3210;
const HTTP_INTERNAL_SERVER_ERROR = 500;

const originalFetch = globalThis.fetch;

beforeEach(() => {
  useQueryMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  globalThis.fetch = originalFetch;
});

describe("github api helpers", () => {
  it("formats small star counts without suffix", () => {
    expect(formatGithubStarCount(STAR_COUNT_999)).toBe("999");
  });

  it("formats thousands with k suffix", () => {
    expect(formatGithubStarCount(STAR_COUNT_1249)).toBe("1k");
    expect(formatGithubStarCount(STAR_COUNT_1550)).toBe("2k");
  });

  it("returns formatted stars on successful response", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(
        new Response(JSON.stringify({ stargazers_count: STAR_COUNT_3210 }), {
          status: 200,
        })
      )
    );

    await expect(fetchGithubRepoStars("querylane/querylane")).resolves.toBe(
      "3k"
    );
  });

  it("returns null when response is not successful", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(
        new Response(null, {
          status: HTTP_INTERNAL_SERVER_ERROR,
        })
      )
    );

    await expect(
      fetchGithubRepoStars("querylane/querylane")
    ).resolves.toBeNull();
  });

  it("returns null on network failure", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new Error("network down")));

    await expect(
      fetchGithubRepoStars("querylane/querylane")
    ).resolves.toBeNull();
  });

  it("returns null when GitHub payload has no numeric star count", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(Response.json({ stargazers_count: "321" }))
    );

    await expect(
      fetchGithubRepoStars("querylane/querylane")
    ).resolves.toBeNull();
  });
});

describe("useGithubRepoStarsQuery", () => {
  it("normalizes repo input and disables empty queries", () => {
    useGithubRepoStarsQuery("  ");

    expect(useQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: false,
        queryKey: ["github-repo-stars", ""],
        retry: 1,
      })
    );
  });

  it("passes abort signal through to decorative GitHub fetches", async () => {
    useGithubRepoStarsQuery(" querylane/querylane ");
    const options = useQueryMock.mock.calls[0]?.[0];
    const { signal } = new AbortController();
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ stargazers_count: 42 }), { status: 200 })
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(options.queryFn({ signal })).resolves.toBe("42");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal })
    );

    expect(useQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
        queryKey: ["github-repo-stars", "querylane/querylane"],
      })
    );
  });
});
