import {
  afterEach,
  beforeEach,
  describe,
  expect,
  rs,
  test,
} from "@rstest/core";

import {
  fetchGithubRepoStars,
  useGithubRepoStarsQuery,
} from "@/hooks/api/github";

const { useQueryMock } = rs.hoisted(() => ({
  useQueryMock:
    rs.fn<
      (options: {
        queryFn: (context: { signal: AbortSignal }) => Promise<string | null>;
      }) => unknown
    >(),
}));

rs.mock("@tanstack/react-query", () => ({
  useQuery: useQueryMock,
}));

const STAR_COUNT_3210 = 3210;
const HTTP_INTERNAL_SERVER_ERROR = 500;

const originalFetch = globalThis.fetch;

beforeEach(() => {
  useQueryMock.mockReset();
});

afterEach(() => {
  rs.unstubAllGlobals();
  globalThis.fetch = originalFetch;
});

describe("github api helpers", () => {
  test("returns formatted stars on successful response", async () => {
    rs.stubGlobal("fetch", () =>
      Promise.resolve(
        Response.json(
          { stargazers_count: STAR_COUNT_3210 },
          {
            status: 200,
          }
        )
      )
    );

    await expect(fetchGithubRepoStars("querylane/querylane")).resolves.toBe(
      "3k"
    );
  });

  test("returns null when response is not successful", async () => {
    rs.stubGlobal("fetch", () =>
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

  test("returns null when GitHub payload has no numeric star count", async () => {
    rs.stubGlobal("fetch", () =>
      Promise.resolve(Response.json({ stargazers_count: "321" }))
    );

    await expect(
      fetchGithubRepoStars("querylane/querylane")
    ).resolves.toBeNull();
  });
});

describe("useGithubRepoStarsQuery", () => {
  test("passes abort signal through to decorative GitHub fetches", async () => {
    useGithubRepoStarsQuery(" querylane/querylane ");
    const options = useQueryMock.mock.calls[0]?.[0];
    if (!options) {
      throw new Error("Expected query options");
    }
    const { signal } = new AbortController();
    const fetchMock = rs.fn(() =>
      Promise.resolve(Response.json({ stargazers_count: 42 }, { status: 200 }))
    );
    rs.stubGlobal("fetch", fetchMock);

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
