import type { Extension } from "@/protogen/querylane/console/v1alpha1/extension_pb";

type ExtensionStatusFilter = "All" | "available" | "installed";
type ExtensionCategoryFilter = "All" | string;

type ExtensionBadgeVariant = "default" | "outline";

interface ExtensionFilterOption<Value extends string> {
  label: string;
  value: Value;
}

type ExtensionScope = "cluster" | "database" | "schema" | "table";
type ExtensionSource =
  | "bundled"
  | "community"
  | "core"
  | "postgresql"
  | "vendor";

interface CuratedExtensionDocs {
  about: string;
  applied: string;
  category: string;
  exampleSql: string;
  meta: string;
  minPostgres: number;
  provides: { label: string; value: string }[];
  scope: ExtensionScope;
  source: ExtensionSource;
}

interface PresentedExtension {
  badgeVariant: ExtensionBadgeVariant;
  category: string | undefined;
  curated: CuratedExtensionDocs | undefined;
  defaultVersion: string;
  description: string;
  displayName: string;
  extension: Extension;
  facts: { label: string; value: string }[];
  installedVersion: string;
  installSql: string;
  key: string;
  metaLabel: string | undefined;
  schema: string;
  scopeLabel: string | undefined;
  searchText: string;
  statusFilter: Exclude<ExtensionStatusFilter, "All">;
  statusLabel: "Available" | "Installed";
  versionLabel: string;
}

interface ExtensionFilters {
  category: ExtensionCategoryFilter;
  search: string;
  status: ExtensionStatusFilter;
}

const SCOPE_LABELS = {
  cluster: "cluster-wide",
  database: "per database",
  schema: "per schema",
  table: "per table",
} satisfies Record<ExtensionScope, string>;

const SOURCE_LABELS = {
  bundled: "Bundled",
  community: "Community",
  core: "Core contrib",
  postgresql: "PostgreSQL",
  vendor: "Vendor",
} satisfies Record<ExtensionSource, string>;
const VERSION_PREFIX_PATTERN = /^v(?=\d)/i;

// Editorial notes for well-known extensions. This is an optional enrichment
// layer: extensions without an entry render only what the server reports.
const EXTENSION_METADATA: Record<string, CuratedExtensionDocs> = {
  hstore: {
    about: "Stores key-value pairs in a single column with index support.",
    applied:
      "Enable it in the database that owns the tables using hstore columns.",
    category: "Data types",
    exampleSql:
      "SELECT settings -> 'sla_hours'\nFROM carriers\nWHERE settings ? 'sla_hours';",
    meta: "flexible attributes",
    minPostgres: 9,
    provides: [
      { label: "hstore type", value: "represent sparse attributes" },
      { label: "GIN indexing", value: "query keys and containment quickly" },
    ],
    scope: "table",
    source: "core",
  },
  pg_stat_statements: {
    about:
      "Records normalized query texts with call counts, total/mean time, rows, and buffer usage. This is the engine behind Querylane’s Query insights screen.",
    applied:
      "Loaded via shared_preload_libraries — tracks every database on the server once installed.",
    category: "Observability",
    exampleSql:
      "SELECT queryid, calls,\n       round(mean_exec_time::numeric, 1) AS mean_ms,\n       rows / greatest(calls, 1) AS rows_per_call\nFROM pg_stat_statements\nORDER BY total_exec_time DESC\nLIMIT 10;",
    meta: "powers Query insights",
    minPostgres: 9,
    provides: [
      {
        label: "pg_stat_statements view",
        value: "per-query timing, calls, rows, and I/O since last reset",
      },
      {
        label: "pg_stat_statements_reset()",
        value: "zero the counters to measure a specific window",
      },
      {
        label: "track_planning setting",
        value: "optionally record planner time per statement",
      },
    ],
    scope: "cluster",
    source: "core",
  },
  pg_trgm: {
    about:
      "Adds trigram matching for fuzzy text search and fast LIKE/ILIKE indexing.",
    applied:
      "Create trigram GIN or GiST indexes on the text columns you search.",
    category: "Search",
    exampleSql:
      "SELECT similarity(name, 'hansa lines') AS score\nFROM carriers\nWHERE name % 'hansa lines'\nORDER BY score DESC;",
    meta: "carrier name search",
    minPostgres: 9,
    provides: [
      { label: "% operator", value: "find similar text despite typos" },
      {
        label: "gin_trgm_ops",
        value: "index fuzzy search and LIKE/ILIKE predicates",
      },
    ],
    scope: "table",
    source: "core",
  },
  pgcrypto: {
    about:
      "Cryptographic helpers for hashing, HMAC, random bytes, and symmetric or public-key encryption.",
    applied:
      "Installed per database; call functions from application-owned schemas as needed.",
    category: "Security",
    exampleSql: "SELECT encode(digest('payload', 'sha256'), 'hex') AS sha256;",
    meta: "used by auth.users",
    minPostgres: 9,
    provides: [
      { label: "digest()", value: "compute hashes and checksums in SQL" },
      { label: "gen_random_uuid()", value: "generate random UUID values" },
      { label: "crypt()", value: "hash passwords with salts" },
    ],
    scope: "database",
    source: "core",
  },
  pgvector: {
    about:
      "Stores embeddings and runs vector similarity search in PostgreSQL with HNSW and IVFFlat indexes.",
    applied:
      "Create vector columns on embedding tables, then add HNSW or IVFFlat indexes for nearest-neighbor search.",
    category: "AI / vectors",
    exampleSql: "SELECT id\nFROM docs\nORDER BY embedding <=> $1\nLIMIT 5;",
    meta: "semantic search",
    minPostgres: 11,
    provides: [
      { label: "vector type", value: "store embeddings next to rows" },
      { label: "<=> operator", value: "rank rows by vector distance" },
      { label: "HNSW indexes", value: "accelerate nearest-neighbor search" },
    ],
    scope: "table",
    source: "community",
  },
  plpgsql: {
    about:
      "PostgreSQL's bundled procedural language for functions and triggers.",
    applied: "Created by default in new PostgreSQL databases.",
    category: "Languages",
    exampleSql:
      "CREATE FUNCTION touch_updated_at()\nRETURNS trigger\nLANGUAGE plpgsql\nAS $$\nBEGIN\n  NEW.updated_at = now();\n  RETURN NEW;\nEND;\n$$;",
    meta: "trigger logic",
    minPostgres: 9,
    provides: [
      { label: "Functions", value: "write server-side control flow" },
      { label: "Triggers", value: "run logic when rows change" },
    ],
    scope: "database",
    source: "bundled",
  },
  postgis: {
    about:
      "Adds geospatial types, indexes, and functions for points, polygons, distances, and projections.",
    applied:
      "Install per database and keep spatial tables in schemas that own geospatial data.",
    category: "Geospatial",
    exampleSql:
      "SELECT ST_Distance(port_a.geog, port_b.geog)\nFROM ports port_a, ports port_b;",
    meta: "maps and routes",
    minPostgres: 12,
    provides: [
      {
        label: "geometry/geography",
        value: "store points, lines, and polygons",
      },
      {
        label: "ST_* functions",
        value: "measure, transform, and join spatial data",
      },
      { label: "GiST indexes", value: "speed up spatial lookups" },
    ],
    scope: "database",
    source: "community",
  },
  timescaledb: {
    about:
      "Adds hypertables for automatic time partitioning, compression, and continuous aggregates.",
    applied:
      "Loaded via shared_preload_libraries, then enabled in databases that own time-series tables.",
    category: "Time-series",
    exampleSql: "SELECT create_hypertable('metrics', by_range('time'));",
    meta: "available to install",
    minPostgres: 12,
    provides: [
      {
        label: "hypertables",
        value: "partition time-series data automatically",
      },
      { label: "compression", value: "reduce storage for historical chunks" },
      {
        label: "continuous aggregates",
        value: "maintain rollups incrementally",
      },
    ],
    scope: "database",
    source: "vendor",
  },
  "uuid-ossp": {
    about:
      "Generates universally unique identifiers directly in PostgreSQL, including random and namespace-based UUIDs.",
    applied:
      "Install per database when UUID defaults or SQL-side UUID generation need uuid-ossp functions.",
    category: "Data types",
    exampleSql: "SELECT uuid_generate_v4();",
    meta: "default for shipments.id",
    minPostgres: 9,
    provides: [
      {
        label: "uuid_generate_v4()",
        value: "random UUIDs without application-side generation",
      },
      {
        label: "uuid_generate_v5()",
        value: "stable namespace-based identifiers",
      },
    ],
    scope: "database",
    source: "core",
  },
  vector: {
    about:
      "Stores embeddings and runs vector similarity search in PostgreSQL with HNSW and IVFFlat indexes.",
    applied:
      "Create vector columns on embedding tables, then add HNSW or IVFFlat indexes for nearest-neighbor search.",
    category: "AI / vectors",
    exampleSql: "SELECT id\nFROM docs\nORDER BY embedding <=> $1\nLIMIT 5;",
    meta: "semantic search",
    minPostgres: 11,
    provides: [
      { label: "vector type", value: "store embeddings next to rows" },
      { label: "<=> operator", value: "rank rows by vector distance" },
      { label: "HNSW indexes", value: "accelerate nearest-neighbor search" },
    ],
    scope: "table",
    source: "community",
  },
} satisfies Record<string, CuratedExtensionDocs>;

function extensionDisplayName(extension: Extension): string {
  const fromName = extension.name.split("/").at(-1);
  return extension.displayName || fromName || "unknown";
}

function extensionStatusFilterValue(
  extension: Extension
): Exclude<ExtensionStatusFilter, "All"> {
  return extension.installed ? "installed" : "available";
}

function curatedDocsForExtension(
  extension: Extension
): CuratedExtensionDocs | undefined {
  return EXTENSION_METADATA[extensionDisplayName(extension).toLowerCase()];
}

function versionLabel(version: string): string {
  return version.replace(VERSION_PREFIX_PATTERN, "") || "";
}

function extensionVersionLabel(extension: Extension): string {
  return (
    versionLabel(extension.installedVersion) ||
    versionLabel(extension.defaultVersion) ||
    "\u2014"
  );
}

function extensionKey(extension: Extension): string {
  return extension.name || extensionDisplayName(extension);
}

const UNQUOTED_EXTENSION_NAME_PATTERN = /^[a-z_][a-z0-9_]*$/;

function extensionInstallSql(displayName: string): string {
  const identifier = UNQUOTED_EXTENSION_NAME_PATTERN.test(displayName)
    ? displayName
    : `"${displayName}"`;
  return `CREATE EXTENSION ${identifier};`;
}

function extensionFacts(
  extension: Extension,
  curated: CuratedExtensionDocs | undefined
): { label: string; value: string }[] {
  const facts: { label: string; value: string }[] = [];
  const installedVersion = versionLabel(extension.installedVersion);
  const defaultVersion = versionLabel(extension.defaultVersion);
  if (installedVersion) {
    facts.push({ label: "Version", value: installedVersion });
  }
  if (defaultVersion) {
    facts.push({ label: "Latest", value: defaultVersion });
  }
  if (extension.schema) {
    facts.push({ label: "Schema", value: extension.schema });
  }
  if (curated) {
    facts.push(
      { label: "Scope", value: SCOPE_LABELS[curated.scope] },
      { label: "Source", value: SOURCE_LABELS[curated.source] },
      { label: "Requires", value: `PG ${curated.minPostgres}+` }
    );
  }
  return facts;
}

function presentExtension(extension: Extension): PresentedExtension {
  const displayName = extensionDisplayName(extension);
  const curated = curatedDocsForExtension(extension);
  const description = extension.comment || curated?.about || "";
  const searchText = [
    displayName,
    description,
    curated?.about,
    curated?.applied,
    curated?.category,
    curated?.meta,
    extension.schema,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return {
    badgeVariant: extension.installed ? "default" : "outline",
    category: curated?.category,
    curated,
    defaultVersion: versionLabel(extension.defaultVersion),
    description,
    displayName,
    extension,
    facts: extensionFacts(extension, curated),
    installSql: extensionInstallSql(displayName),
    installedVersion: versionLabel(extension.installedVersion),
    key: extensionKey(extension),
    metaLabel: curated?.meta,
    schema: extension.schema,
    scopeLabel: curated ? SCOPE_LABELS[curated.scope] : undefined,
    searchText,
    statusFilter: extensionStatusFilterValue(extension),
    statusLabel: extension.installed ? "Installed" : "Available",
    versionLabel: extensionVersionLabel(extension),
  };
}

function presentExtensions(extensions: Extension[]): PresentedExtension[] {
  return extensions.map(presentExtension);
}

function matchesStatus(
  extension: PresentedExtension,
  status: ExtensionStatusFilter
) {
  return status === "All" || extension.statusFilter === status;
}

function matchesCategory(
  extension: PresentedExtension,
  category: ExtensionCategoryFilter
) {
  return category === "All" || extension.category === category;
}

function filterPresentedExtensions(
  extensions: PresentedExtension[],
  filters: ExtensionFilters
): PresentedExtension[] {
  const search = filters.search.trim().toLowerCase();
  return extensions.filter(
    (extension) =>
      matchesStatus(extension, filters.status) &&
      matchesCategory(extension, filters.category) &&
      (search === "" || extension.searchText.includes(search))
  );
}

function extensionInventorySummary(extensions: PresentedExtension[]): string {
  const installed = extensions.filter(
    (extension) => extension.statusFilter === "installed"
  ).length;
  const available = extensions.length - installed;
  return `${installed} installed \u00b7 ${available} available on this server`;
}

function extensionCategoryOptions(
  extensions: PresentedExtension[]
): ExtensionFilterOption<string>[] {
  const categories = new Set<string>();
  for (const extension of extensions) {
    if (extension.category) {
      categories.add(extension.category);
    }
  }
  return [...categories]
    .sort((left, right) => left.localeCompare(right))
    .map((category) => ({ label: category, value: category }));
}

export type {
  ExtensionCategoryFilter,
  ExtensionFilterOption,
  ExtensionStatusFilter,
  PresentedExtension,
};
export {
  extensionCategoryOptions,
  extensionInventorySummary,
  filterPresentedExtensions,
  presentExtensions,
};
