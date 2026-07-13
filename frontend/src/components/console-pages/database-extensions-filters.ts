import type { Extension } from "@/protogen/querylane/console/v1alpha1/extension_pb";

type ExtensionStatusFilter = "All" | "available" | "installed";
type ExtensionScopeFilter = "All" | "cluster" | "database" | "schema" | "table";
type ExtensionSourceFilter =
  | "All"
  | "bundled"
  | "community"
  | "core"
  | "postgresql"
  | "vendor";
type ExtensionCategoryFilter = "All" | string;

type ExtensionBadgeVariant = "default" | "outline";

interface ExtensionFilterOption<Value extends string> {
  label: string;
  value: Value;
}

interface ExtensionMetadata {
  about: string;
  applied: string;
  category: string;
  exampleSql: string;
  installSql?: string;
  meta: string;
  minPostgres: number;
  provides: { label: string; value: string }[];
  scope: Exclude<ExtensionScopeFilter, "All">;
  source: Exclude<ExtensionSourceFilter, "All">;
}

interface PresentedExtension {
  about: string;
  applied: string;
  badgeVariant: ExtensionBadgeVariant;
  category: string;
  categoryFilter: Exclude<ExtensionCategoryFilter, "All">;
  defaultVersion: string;
  description: string;
  displayName: string;
  exampleSql: string;
  extension: Extension;
  facts: { label: string; value: string }[];
  installedVersion: string;
  installSql?: string;
  key: string;
  metaLabel: string;
  provides: { label: string; value: string }[];
  requiresLabel: string;
  schema: string;
  scopeFilter: Exclude<ExtensionScopeFilter, "All">;
  scopeLabel: string;
  searchText: string;
  sourceFilter: Exclude<ExtensionSourceFilter, "All">;
  sourceLabel: string;
  statusFilter: Exclude<ExtensionStatusFilter, "All">;
  statusLabel: "Available" | "Installed";
  versionLabel: string;
}

interface ExtensionFilters {
  category: ExtensionCategoryFilter;
  scope: ExtensionScopeFilter;
  search: string;
  source: ExtensionSourceFilter;
  status: ExtensionStatusFilter;
}

const SCOPE_LABELS = {
  cluster: "cluster-wide",
  database: "per database",
  schema: "per schema",
  table: "per table",
} satisfies Record<Exclude<ExtensionScopeFilter, "All">, string>;

const SOURCE_LABELS = {
  bundled: "Bundled",
  community: "Community",
  core: "Core contrib",
  postgresql: "PostgreSQL",
  vendor: "Vendor",
} satisfies Record<Exclude<ExtensionSourceFilter, "All">, string>;
const VERSION_PREFIX_PATTERN = /^v(?=\d)/i;

const EXTENSION_METADATA: Record<string, ExtensionMetadata> = {
  hstore: {
    about: "Stores key-value pairs in a single column with index support.",
    applied:
      "Enable it in the database that owns the tables using hstore columns.",
    category: "Data types",
    exampleSql:
      "SELECT settings -> 'sla_hours'\nFROM carriers\nWHERE settings ? 'sla_hours';",
    installSql: "CREATE EXTENSION hstore;",
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
    installSql: "CREATE EXTENSION pg_stat_statements;",
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
    installSql: "CREATE EXTENSION pg_trgm;",
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
    installSql: "CREATE EXTENSION pgcrypto;",
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
    installSql: "CREATE EXTENSION vector;",
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
    installSql: "CREATE EXTENSION postgis;",
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
    installSql: "CREATE EXTENSION timescaledb;",
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
    installSql: 'CREATE EXTENSION "uuid-ossp";',
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
    installSql: "CREATE EXTENSION vector;",
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
} satisfies Record<string, ExtensionMetadata>;

const DEFAULT_METADATA = {
  about:
    "PostgreSQL reports this extension through pg_available_extensions. Querylane shows its installed state and version without changing the database.",
  applied:
    "Querylane reads pg_available_extensions and pg_extension only; it does not install, update, or drop extensions.",
  category: "Extension",
  exampleSql:
    "SELECT extname, extversion\nFROM pg_extension\nORDER BY extname;",
  meta: "catalog visibility",
  minPostgres: 9,
  provides: [
    { label: "Catalog visibility", value: "see whether it is installed" },
    {
      label: "Version tracking",
      value: "compare installed and default versions",
    },
  ],
  scope: "database",
  source: "postgresql",
} satisfies ExtensionMetadata;

function extensionDisplayName(extension: Extension): string {
  const fromName = extension.name.split("/").at(-1);
  return extension.displayName || fromName || "unknown";
}

function extensionStatusFilterValue(
  extension: Extension
): Exclude<ExtensionStatusFilter, "All"> {
  return extension.installed ? "installed" : "available";
}

function normalizeExtensionName(extension: Extension): string {
  return extensionDisplayName(extension).toLowerCase();
}

function metadataForExtension(extension: Extension): ExtensionMetadata {
  return (
    EXTENSION_METADATA[normalizeExtensionName(extension)] ?? DEFAULT_METADATA
  );
}

function extensionSchemaLabel(extension: Extension): string {
  return extension.schema || "—";
}

function versionLabel(version: string): string {
  return version.replace(VERSION_PREFIX_PATTERN, "") || "—";
}

function extensionVersionLabel(extension: Extension): string {
  if (extension.installedVersion) {
    return versionLabel(extension.installedVersion);
  }
  if (extension.defaultVersion) {
    return versionLabel(extension.defaultVersion);
  }
  return "—";
}

function extensionKey(extension: Extension): string {
  return extension.name || extensionDisplayName(extension);
}

function presentExtension(extension: Extension): PresentedExtension {
  const displayName = extensionDisplayName(extension);
  const metadata = metadataForExtension(extension);
  const statusFilter = extensionStatusFilterValue(extension);
  const statusLabel = extension.installed ? "Installed" : "Available";
  const defaultVersion = versionLabel(extension.defaultVersion);
  const installedVersion = versionLabel(extension.installedVersion);
  const description = extension.comment || metadata.about;
  const schema = extensionSchemaLabel(extension);
  const sourceLabel = SOURCE_LABELS[metadata.source];
  const scopeLabel = SCOPE_LABELS[metadata.scope];
  const requiresLabel = `PG ${metadata.minPostgres}+`;
  const facts = [
    { label: "Version", value: installedVersion },
    { label: "Latest", value: defaultVersion },
    { label: "Scope", value: scopeLabel },
    { label: "Source", value: sourceLabel },
    { label: "Requires", value: requiresLabel },
    { label: "Schema", value: schema },
  ];
  const searchText = [
    displayName,
    description,
    metadata.about,
    metadata.applied,
    metadata.category,
    metadata.meta,
    sourceLabel,
    scopeLabel,
    schema,
  ]
    .join(" ")
    .toLowerCase();

  return {
    about: metadata.about,
    applied: metadata.applied,
    badgeVariant: extension.installed ? "default" : "outline",
    category: metadata.category,
    categoryFilter: metadata.category,
    defaultVersion,
    description,
    displayName,
    exampleSql: metadata.exampleSql,
    extension,
    facts,
    installedVersion,
    key: extensionKey(extension),
    metaLabel: metadata.meta,
    provides: metadata.provides,
    requiresLabel,
    schema,
    scopeFilter: metadata.scope,
    scopeLabel,
    searchText,
    sourceFilter: metadata.source,
    sourceLabel,
    statusFilter,
    statusLabel,
    versionLabel: extensionVersionLabel(extension),
    ...(metadata.installSql ? { installSql: metadata.installSql } : {}),
  };
}

function presentExtensions(extensions: Extension[]): PresentedExtension[] {
  return extensions.map(presentExtension).sort((left, right) => {
    if (left.statusFilter !== right.statusFilter) {
      return left.statusFilter === "installed" ? -1 : 1;
    }
    return left.displayName.localeCompare(right.displayName);
  });
}

function matchesFilter<Value extends string>(value: Value, filter: Value) {
  return filter === "All" || value === filter;
}

function filterPresentedExtensions(
  extensions: PresentedExtension[],
  filters: ExtensionFilters
): PresentedExtension[] {
  const search = filters.search.trim().toLowerCase();
  return extensions.filter((extension) => {
    if (!matchesFilter(extension.statusFilter, filters.status)) {
      return false;
    }
    if (!matchesFilter(extension.scopeFilter, filters.scope)) {
      return false;
    }
    if (!matchesFilter(extension.sourceFilter, filters.source)) {
      return false;
    }
    if (!matchesFilter(extension.categoryFilter, filters.category)) {
      return false;
    }
    return !search || extension.searchText.includes(search);
  });
}

function extensionInventorySummary(extensions: PresentedExtension[]): string {
  const installed = extensions.filter(
    (extension) => extension.statusFilter === "installed"
  ).length;
  const available = extensions.length - installed;
  return `${installed} installed · ${available} available on this server`;
}

function uniqueOptions<Value extends string>(
  values: { label: string; value: Value }[]
): ExtensionFilterOption<Value>[] {
  const seen = new Set<Value>();
  const options: ExtensionFilterOption<Value>[] = [];
  for (const value of values) {
    if (!seen.has(value.value)) {
      seen.add(value.value);
      options.push(value);
    }
  }
  return options.sort((left, right) => left.label.localeCompare(right.label));
}

function extensionFilterOptions(extensions: PresentedExtension[]) {
  return {
    categories: uniqueOptions(
      extensions.map((extension) => ({
        label: extension.category,
        value: extension.categoryFilter,
      }))
    ),
    scopes: uniqueOptions(
      extensions.map((extension) => ({
        label: extension.scopeLabel,
        value: extension.scopeFilter,
      }))
    ),
    sources: uniqueOptions(
      extensions.map((extension) => ({
        label: extension.sourceLabel,
        value: extension.sourceFilter,
      }))
    ),
    statuses: uniqueOptions(
      extensions.map((extension) => ({
        label: extension.statusLabel,
        value: extension.statusFilter,
      }))
    ),
  };
}

export type {
  ExtensionCategoryFilter,
  ExtensionFilterOption,
  ExtensionFilters,
  ExtensionScopeFilter,
  ExtensionSourceFilter,
  ExtensionStatusFilter,
  PresentedExtension,
};
export {
  extensionFilterOptions,
  extensionInventorySummary,
  filterPresentedExtensions,
  presentExtensions,
};
