// allow-direct-query: GitHub REST API, not a ConnectRPC service
import { useQuery } from "@tanstack/react-query";
import { QUERY_STALE_TIME } from "@/lib/query-policy";

const ONE_SECOND_IN_MILLISECONDS = 1000;
const ONE_MINUTE_IN_SECONDS = 60;
const SIXTY_MINUTES = 60;
const STAR_COUNT_THOUSAND = 1000;
const GITHUB_STARS_GC_TIME_MS =
  SIXTY_MINUTES * ONE_MINUTE_IN_SECONDS * ONE_SECOND_IN_MILLISECONDS;

interface GitHubRepoResponse {
  stargazers_count?: unknown;
}

export function formatGithubStarCount(starCount: number): string {
  if (starCount >= STAR_COUNT_THOUSAND) {
    return `${Math.round(starCount / STAR_COUNT_THOUSAND)}k`;
  }

  return String(starCount);
}

export async function fetchGithubRepoStars(
  repo: string,
  signal?: AbortSignal
): Promise<string | null> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${repo}`,
      signal === undefined ? undefined : { signal }
    );
    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as GitHubRepoResponse;
    const stars =
      typeof payload.stargazers_count === "number"
        ? payload.stargazers_count
        : null;
    if (stars === null) {
      return null;
    }

    return formatGithubStarCount(stars);
  } catch {
    // Github stars are decorative only, so we silently ignore failures.
    return null;
  }
}

export function useGithubRepoStarsQuery(repo?: string) {
  const normalizedRepo = repo?.trim() ?? "";

  return useQuery({
    enabled: normalizedRepo.length > 0,
    gcTime: GITHUB_STARS_GC_TIME_MS,
    queryFn: ({ signal }) => fetchGithubRepoStars(normalizedRepo, signal),
    queryKey: ["github-repo-stars", normalizedRepo],
    retry: 1,
    staleTime: QUERY_STALE_TIME.static,
  });
}
