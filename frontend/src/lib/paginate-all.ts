/**
 * Collect every page from a token-based list endpoint.
 *
 * @example
 * const allSchemas = await paginateAll(
 *   (pageToken) => client.listSchemas({ parent, pageSize: 1000, pageToken }),
 *   (response) => response.schemas
 * )
 */
interface PaginatedResponse {
  nextPageToken?: string;
}

export async function paginateAll<Response extends PaginatedResponse, Item>(
  loadPage: (pageToken?: string) => Promise<Response>,
  selectItems: (response: Response) => readonly Item[]
) {
  const result = await paginateAllWithLastResponse(loadPage, selectItems);
  return result.items;
}

export async function paginateAllWithLastResponse<
  Response extends PaginatedResponse,
  Item,
>(
  loadPage: (pageToken?: string) => Promise<Response>,
  selectItems: (response: Response) => readonly Item[]
) {
  const items: Item[] = [];
  const seenPageTokens = new Set<string>();

  async function collectPage(pageToken?: string) {
    const response = await loadPage(pageToken);
    items.push(...selectItems(response));

    const { nextPageToken } = response;
    if (nextPageToken === undefined || nextPageToken === "") {
      return response;
    }
    if (seenPageTokens.has(nextPageToken)) {
      throw new Error("pagination returned a repeated next page token");
    }

    seenPageTokens.add(nextPageToken);
    return await collectPage(nextPageToken);
  }

  const lastResponse = await collectPage();
  return { items, lastResponse } satisfies {
    items: Item[];
    lastResponse: Response | undefined;
  };
}

export async function paginateUpTo<Response extends PaginatedResponse, Item>(
  maxRows: number,
  loadPage: (pageToken?: string) => Promise<Response>,
  selectItems: (response: Response) => readonly Item[]
) {
  if (!Number.isInteger(maxRows) || maxRows <= 0) {
    throw new RangeError("pagination row cap must be a positive integer");
  }

  const items: Item[] = [];
  const seenPageTokens = new Set<string>();
  async function collectPage(pageToken?: string) {
    const response = await loadPage(pageToken);
    const pageItems = selectItems(response);
    const remaining = maxRows - items.length;
    items.push(...pageItems.slice(0, remaining));

    const { nextPageToken } = response;
    const hasMorePages = nextPageToken !== undefined && nextPageToken !== "";
    const pageOverflowed = pageItems.length > remaining;
    if (items.length === maxRows) {
      return {
        items,
        lastResponse: response,
        truncated: pageOverflowed || hasMorePages,
      } satisfies {
        items: Item[];
        lastResponse: Response;
        truncated: boolean;
      };
    }
    if (!hasMorePages) {
      return { items, lastResponse: response, truncated: false } satisfies {
        items: Item[];
        lastResponse: Response;
        truncated: boolean;
      };
    }
    if (seenPageTokens.has(nextPageToken)) {
      throw new Error("pagination returned a repeated next page token");
    }

    seenPageTokens.add(nextPageToken);
    return await collectPage(nextPageToken);
  }

  return await collectPage();
}
