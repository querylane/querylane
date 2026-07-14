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
): Promise<Item[]> {
  const result = await paginateAllWithLastResponse(loadPage, selectItems);
  return result.items;
}

export async function paginateAllWithLastResponse<
  Response extends PaginatedResponse,
  Item,
>(
  loadPage: (pageToken?: string) => Promise<Response>,
  selectItems: (response: Response) => readonly Item[]
): Promise<{ items: Item[]; lastResponse: Response | undefined }> {
  const items: Item[] = [];
  const seenPageTokens = new Set<string>();

  async function collectPage(pageToken?: string): Promise<Response> {
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
    return collectPage(nextPageToken);
  }

  const lastResponse = await collectPage();
  return { items, lastResponse };
}
