interface QueryErrorLike {
  error: unknown;
}

interface QueryErrorDescriptor {
  endpoint?: string | undefined;
  label: string;
  query: QueryErrorLike;
}

interface QueryErrorResult {
  endpoint?: string | undefined;
  error: unknown;
  label: string;
}

export function collectQueryErrors(
  ...queries: QueryErrorDescriptor[]
): QueryErrorResult[] {
  return queries.flatMap(({ endpoint, label, query }) =>
    query.error ? [{ endpoint, error: query.error, label }] : []
  );
}

export type { QueryErrorResult };
