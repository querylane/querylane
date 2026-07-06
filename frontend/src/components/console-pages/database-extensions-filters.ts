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
  category: string;
  exampleSql: string;
  installSql?: string;
  provides: { label: string; value: string }[];
  scope: Exclude<ExtensionScopeFilter, "All">;
  source: Exclude<ExtensionSourceFilter, "All">;
}

interface PresentedExtension {
  about: string;
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
  provides: { label: string; value: string }[];
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

const EXTENSION_METADATA: Record<string, ExtensionMetadata> = {
  hstore: {
    about: "Stores key-value pairs in a single column with index support.",
    category: "Data types",
    exampleSql:
      "SELECT settings -> 'sla_hours' FROM carriers WHERE settings ? 'sla_hours';",
    installSql: "CREATE EXTENSION hstore;",
    provides: [
      { label: "hstore type", value: "Represent sparse attributes" },
      { label: "GIN indexing", value: "Query keys and containment quickly" },
    ],
    scope: "table",
    source: "core",
  },
  pg_stat_statements: {
    about: "Tracks planning and execution statistics for normalized SQL.",
    category: "Observability",
    exampleSql:
      "SELECT query, calls, mean_exec_time\nFROM pg_stat_statements\nORDER BY total_exec_time DESC\nLIMIT 20;",
    installSql: "CREATE EXTENSION pg_stat_statements;",
    provides: [
      { label: "Query ranking", value: "Find expensive statements" },
      {
        label: "Timing stats",
        value: "Compare mean, min, max, and total time",
      },
    ],
    scope: "cluster",
    source: "core",
  },
  pg_trgm: {
    about:
      "Adds trigram matching for fuzzy text search and fast LIKE or ILIKE indexes.",
    category: "Search",
    exampleSql:
      "SELECT similarity(name, 'hansa lines') AS score\nFROM carriers\nWHERE name % 'hansa lines'\nORDER BY score DESC;",
    installSql: "CREATE EXTENSION pg_trgm;",
    provides: [
      { label: "% operator", value: "Find similar text despite typos" },
      {
        label: "gin_trgm_ops",
        value: "Index fuzzy search and LIKE or ILIKE predicates",
      },
    ],
    scope: "table",
    source: "core",
  },
  pgcrypto: {
    about: "Cryptographic functions for hashing, HMAC, and encryption.",
    category: "Security",
    exampleSql: "SELECT crypt('secret', gen_salt('bf'));",
    installSql: "CREATE EXTENSION pgcrypto;",
    provides: [
      { label: "crypt()", value: "Hash passwords and secrets" },
      { label: "digest()", value: "Compute checksums in SQL" },
    ],
    scope: "database",
    source: "core",
  },
  pgvector: {
    about: "Stores embeddings and runs vector similarity search in PostgreSQL.",
    category: "AI / vectors",
    exampleSql: "SELECT id FROM docs ORDER BY embedding <=> $1 LIMIT 5;",
    installSql: "CREATE EXTENSION vector;",
    provides: [
      { label: "vector type", value: "Store embeddings next to rows" },
      { label: "HNSW indexes", value: "Approximate nearest-neighbor search" },
    ],
    scope: "table",
    source: "community",
  },
  plpgsql: {
    about:
      "PostgreSQL's bundled procedural language for functions and triggers.",
    category: "Languages",
    exampleSql:
      "CREATE FUNCTION touch_updated_at()\nRETURNS trigger\nLANGUAGE plpgsql\nAS $$\nBEGIN\n  NEW.updated_at = now();\n  RETURN NEW;\nEND;\n$$;",
    provides: [
      { label: "Functions", value: "Write server-side control flow" },
      { label: "Triggers", value: "Run logic when rows change" },
    ],
    scope: "database",
    source: "bundled",
  },
  postgis: {
    about: "Adds geospatial types, functions, and indexes to PostgreSQL.",
    category: "Geospatial",
    exampleSql:
      "SELECT ST_Distance(port_a.geog, port_b.geog)\nFROM ports port_a, ports port_b;",
    installSql: "CREATE EXTENSION postgis;",
    provides: [
      { label: "geometry", value: "Store points, lines, and polygons" },
      { label: "GiST indexes", value: "Speed up spatial lookups" },
    ],
    scope: "database",
    source: "community",
  },
  "uuid-ossp": {
    about: "Generates universally unique identifiers directly in PostgreSQL.",
    category: "Data types",
    exampleSql: "SELECT uuid_generate_v4();",
    installSql: 'CREATE EXTENSION "uuid-ossp";',
    provides: [
      {
        label: "uuid_generate_v4()",
        value: "Random UUIDs without application-side generation",
      },
      {
        label: "uuid_generate_v1()",
        value: "Time-based UUIDs when ordering matters",
      },
    ],
    scope: "database",
    source: "core",
  },
  vector: {
    about: "Stores embeddings and runs vector similarity search in PostgreSQL.",
    category: "AI / vectors",
    exampleSql: "SELECT id FROM docs ORDER BY embedding <=> $1 LIMIT 5;",
    installSql: "CREATE EXTENSION vector;",
    provides: [
      { label: "vector type", value: "Store embeddings next to rows" },
      { label: "HNSW indexes", value: "Approximate nearest-neighbor search" },
    ],
    scope: "table",
    source: "community",
  },
} satisfies Record<string, ExtensionMetadata>;

const DEFAULT_METADATA = {
  about:
    "PostgreSQL reports this extension through pg_available_extensions. Querylane shows its installed state and version without changing the database.",
  category: "Extension",
  exampleSql:
    "SELECT extname, extversion\nFROM pg_extension\nORDER BY extname;",
  provides: [
    { label: "Catalog visibility", value: "See whether it is installed" },
    {
      label: "Version tracking",
      value: "Compare installed and default versions",
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

function extensionVersionLabel(extension: Extension): string {
  if (extension.installedVersion) {
    return extension.installedVersion;
  }
  if (extension.defaultVersion) {
    return `v${extension.defaultVersion}`;
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
  const defaultVersion = extension.defaultVersion || "—";
  const installedVersion = extension.installedVersion || "—";
  const description = extension.comment || metadata.about;
  const schema = extensionSchemaLabel(extension);
  const sourceLabel = SOURCE_LABELS[metadata.source];
  const scopeLabel = SCOPE_LABELS[metadata.scope];
  const facts = [
    { label: "Version", value: installedVersion },
    { label: "Default", value: defaultVersion },
    { label: "Scope", value: scopeLabel },
    { label: "Source", value: sourceLabel },
    { label: "Schema", value: schema },
  ];
  const searchText = [
    displayName,
    description,
    metadata.category,
    sourceLabel,
    scopeLabel,
    schema,
  ]
    .join(" ")
    .toLowerCase();

  return {
    about: metadata.about,
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
    provides: metadata.provides,
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
