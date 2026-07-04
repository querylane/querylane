interface PostgresIndexMethodDisplay {
  badges: string[];
  label: string;
  source: "built-in" | "custom" | "extension";
  summary: string;
}

const INDEX_METHOD_META: Record<string, PostgresIndexMethodDisplay> = {
  bloom: {
    badges: ["probabilistic", "multi-column"],
    label: "Bloom",
    source: "extension",
    summary: "Extension method for compact probabilistic multi-column indexes.",
  },
  brin: {
    badges: ["block ranges", "large tables"],
    label: "BRIN",
    source: "built-in",
    summary: "Block range summaries for physically correlated large tables.",
  },
  btree: {
    badges: ["default", "range"],
    label: "B-tree",
    source: "built-in",
    summary:
      "Default balanced tree for equality, ranges, sorting, and null checks.",
  },
  gin: {
    badges: ["inverted", "composite values"],
    label: "GIN",
    source: "built-in",
    summary:
      "Inverted index for arrays, JSONB, and full-text style containment.",
  },
  gist: {
    badges: ["generalized", "nearest neighbor"],
    label: "GiST",
    source: "built-in",
    summary:
      "Generalized search tree for geometric, range, and custom operators.",
  },
  hash: {
    badges: ["equality"],
    label: "Hash",
    source: "built-in",
    summary: "Hash code lookup for simple equality comparisons.",
  },
  hnsw: {
    badges: ["vector", "nearest neighbor"],
    label: "HNSW",
    source: "extension",
    summary: "Vector similarity graph index, commonly provided by pgvector.",
  },
  ivfflat: {
    badges: ["vector", "nearest neighbor"],
    label: "IVFFlat",
    source: "extension",
    summary:
      "Vector similarity inverted-file index, commonly provided by pgvector.",
  },
  rum: {
    badges: ["inverted", "ranking"],
    label: "RUM",
    source: "extension",
    summary: "Extension inverted index often used for ranked full-text search.",
  },
  spgist: {
    badges: ["partitioned", "non-balanced"],
    label: "SP-GiST",
    source: "built-in",
    summary:
      "Space-partitioned search for tries, quadtrees, and similar structures.",
  },
};

function normalizeIndexMethod(method: string): string {
  return method.trim().toLowerCase().replaceAll("-", "").replaceAll("_", "");
}

function describePostgresIndexMethod(
  method: string
): PostgresIndexMethodDisplay {
  const normalized = normalizeIndexMethod(method);
  const knownMethod = INDEX_METHOD_META[normalized];
  if (knownMethod) {
    return knownMethod;
  }
  const label = method.trim() || "unknown";
  return {
    badges: ["access method"],
    label,
    source: "custom",
    summary: "Custom PostgreSQL index access method or extension method.",
  };
}

export type { PostgresIndexMethodDisplay };
export { describePostgresIndexMethod, normalizeIndexMethod };
