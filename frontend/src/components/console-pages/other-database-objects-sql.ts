import type { OtherObjectCategory } from "@/components/console-pages/database-object-categories";

/**
 * SQL sources for the "other database objects" inventory (routines, sequences,
 * types, ...). Two statement shapes are built from the same per-category
 * fragments:
 *
 * - a summary statement returning the top rows per category plus an exact
 *   per-category total, for the overview cards, and
 * - a per-category browse statement with optional name search and keyset
 *   pagination, for the "View all" dialog.
 *
 * Neither shape fetches object definitions (`pg_get_functiondef` and friends):
 * definitions can be kilobytes per routine and nothing in these surfaces
 * renders them.
 *
 * ExecuteQuery has no bind parameters, so user input (search text, page
 * cursors) is embedded via the literal escapers below.
 */

const SUMMARY_ROWS_PER_CATEGORY = 5;
const BROWSE_PAGE_SIZE = 100;

const RESULT_COLUMNS =
  "category, name, badge, summary, detail, sort_key, status";

const VISIBLE_NAMESPACES_CTE = `visible_namespaces AS (
  SELECT oid, nspname
  FROM pg_catalog.pg_namespace
  WHERE nspname NOT IN ('pg_catalog', 'information_schema')
    AND nspname !~ '^pg_toast'
    AND nspname !~ '^pg_temp_'
)`;

const ROUTINES_SQL = `SELECT
    'routines'::text AS category,
    format('%I.%I(%s)', n.nspname, p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid)) AS name,
    CASE p.prokind
      WHEN 'p' THEN 'PROCEDURE'
      WHEN 'a' THEN 'AGGREGATE'
      WHEN 'w' THEN 'WINDOW'
      ELSE 'FUNCTION'
    END AS badge,
    concat_ws(
      ' · ',
      NULLIF(pg_catalog.pg_get_function_result(p.oid), ''),
      l.lanname,
      CASE p.provolatile WHEN 'i' THEN 'immutable' WHEN 's' THEN 'stable' ELSE 'volatile' END,
      CASE WHEN p.prosecdef THEN 'security definer' ELSE NULL END
    ) AS summary,
    COALESCE(pg_catalog.obj_description(p.oid, 'pg_proc'), '') AS detail,
    format('%s:%s:%s', n.nspname, p.proname, p.oid) AS sort_key,
    ''::text AS status
  FROM pg_catalog.pg_proc p
  JOIN visible_namespaces n ON n.oid = p.pronamespace
  JOIN pg_catalog.pg_language l ON l.oid = p.prolang`;

const SEQUENCES_SQL = `SELECT
    'sequences'::text AS category,
    format('%I.%I', n.nspname, c.relname) AS name,
    'SEQUENCE'::text AS badge,
    concat_ws(
      ' · ',
      format(
        'last %s',
        CASE
          WHEN pg_catalog.has_sequence_privilege(c.oid, 'SELECT')
            THEN COALESCE(pg_catalog.pg_sequence_last_value(c.oid)::text, 'not called')
          ELSE 'unavailable'
        END
      ),
      format('increment %s', s.seqincrement),
      format('min %s', s.seqmin),
      format('max %s', s.seqmax),
      format('cache %s', s.seqcache),
      CASE WHEN s.seqcycle THEN 'cycles' ELSE NULL END
    ) AS summary,
    COALESCE(pg_catalog.obj_description(c.oid, 'pg_class'), '') AS detail,
    format('%s:%s', n.nspname, c.relname) AS sort_key,
    ''::text AS status
  FROM pg_catalog.pg_class c
  JOIN visible_namespaces n ON n.oid = c.relnamespace
  JOIN pg_catalog.pg_sequence s ON s.seqrelid = c.oid
  WHERE c.relkind = 'S'`;

const TYPES_SQL = `SELECT
    'types'::text AS category,
    format('%I.%I', n.nspname, t.typname) AS name,
    CASE t.typtype
      WHEN 'e' THEN 'ENUM'
      WHEN 'd' THEN 'DOMAIN'
      WHEN 'c' THEN 'COMPOSITE'
      WHEN 'r' THEN 'RANGE'
      ELSE 'TYPE'
    END AS badge,
    CASE t.typtype
      WHEN 'e' THEN COALESCE(enum_labels.labels, '')
      WHEN 'd' THEN concat_ws(' ', pg_catalog.format_type(t.typbasetype, t.typtypmod), NULLIF(domain_checks.checks, ''))
      WHEN 'c' THEN COALESCE(composite_attrs.attrs, '')
      WHEN 'r' THEN concat('range over ', pg_catalog.format_type(r.rngsubtype, NULL::integer))
      ELSE pg_catalog.format_type(t.oid, NULL::integer)
    END AS summary,
    COALESCE(pg_catalog.obj_description(t.oid, 'pg_type'), '') AS detail,
    format('%s:%s', n.nspname, t.typname) AS sort_key,
    ''::text AS status
  FROM pg_catalog.pg_type t
  JOIN visible_namespaces n ON n.oid = t.typnamespace
  LEFT JOIN pg_catalog.pg_class cls ON cls.oid = t.typrelid
  LEFT JOIN pg_catalog.pg_range r ON r.rngtypid = t.oid
  LEFT JOIN LATERAL (
    SELECT pg_catalog.string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder) AS labels
    FROM pg_catalog.pg_enum e
    WHERE e.enumtypid = t.oid
  ) enum_labels ON true
  LEFT JOIN LATERAL (
    SELECT pg_catalog.string_agg(pg_catalog.pg_get_constraintdef(con.oid), ' ' ORDER BY con.conname) AS checks
    FROM pg_catalog.pg_constraint con
    WHERE con.contypid = t.oid
  ) domain_checks ON true
  LEFT JOIN LATERAL (
    SELECT pg_catalog.string_agg(format('%I %s', a.attname, pg_catalog.format_type(a.atttypid, a.atttypmod)), ', ' ORDER BY a.attnum) AS attrs
    FROM pg_catalog.pg_attribute a
    WHERE a.attrelid = t.typrelid
      AND a.attnum > 0
      AND NOT a.attisdropped
  ) composite_attrs ON true
  WHERE t.typtype IN ('e', 'd', 'c', 'r')
    AND t.typname !~ '^_'
    AND (t.typtype <> 'c' OR cls.relkind = 'c')`;

const COLLATIONS_SQL = `SELECT
    'collations'::text AS category,
    CASE WHEN n.nspname = 'public' THEN format('%I', c.collname) ELSE format('%I.%I', n.nspname, c.collname) END AS name,
    CASE c.collprovider WHEN 'i' THEN 'icu' WHEN 'c' THEN 'libc' WHEN 'b' THEN 'builtin' ELSE c.collprovider::text END AS badge,
    concat_ws(
      ' · ',
      COALESCE(
        NULLIF(pg_catalog.to_jsonb(c)->>'colllocale', ''),
        NULLIF(pg_catalog.to_jsonb(c)->>'colliculocale', ''),
        NULLIF(c.collcollate, '')
      ),
      CASE WHEN c.collisdeterministic THEN 'deterministic' ELSE 'nondeterministic' END,
      CASE WHEN c.collversion IS NOT NULL THEN concat('version ', c.collversion) ELSE NULL END
    ) AS summary,
    ''::text AS detail,
    format('%s:%s:%s', n.nspname, c.collname, c.oid) AS sort_key,
    ''::text AS status
  FROM pg_catalog.pg_collation c
  JOIN visible_namespaces n ON n.oid = c.collnamespace
  WHERE c.collname <> 'default'`;

const FDW_SERVERS_SQL = `SELECT
    'fdwServers'::text AS category,
    s.srvname AS name,
    w.fdwname AS badge,
    concat_ws(' · ', options.summary, COALESCE(pg_catalog.obj_description(s.oid, 'pg_foreign_server'), '')) AS summary,
    ''::text AS detail,
    s.srvname AS sort_key,
    ''::text AS status
  FROM pg_catalog.pg_foreign_server s
  JOIN pg_catalog.pg_foreign_data_wrapper w ON w.oid = s.srvfdw
  LEFT JOIN LATERAL (
    SELECT COALESCE(pg_catalog.string_agg(option, ', ' ORDER BY option), '') AS summary
    FROM pg_catalog.unnest(s.srvoptions) AS option
  ) options ON true`;

const REPLICATION_SQL = `SELECT
    'replication'::text AS category,
    p.pubname AS name,
    'PUBLICATION'::text AS badge,
    concat_ws(
      ' · ',
      CASE WHEN p.puballtables THEN 'all tables' ELSE 'selected tables' END,
      concat_ws(', ', CASE WHEN p.pubinsert THEN 'insert' END, CASE WHEN p.pubupdate THEN 'update' END, CASE WHEN p.pubdelete THEN 'delete' END, CASE WHEN p.pubtruncate THEN 'truncate' END)
    ) AS summary,
    ''::text AS detail,
    p.pubname AS sort_key,
    'ok'::text AS status
  FROM pg_catalog.pg_publication p`;

const EVENT_TRIGGERS_SQL = `SELECT
    'eventTriggers'::text AS category,
    e.evtname AS name,
    concat('ON ', e.evtevent) AS badge,
    COALESCE(pg_catalog.obj_description(e.oid, 'pg_event_trigger'), '') AS summary,
    format('→ %s', e.evtfoid::regprocedure::text) AS detail,
    e.evtname AS sort_key,
    CASE e.evtenabled WHEN 'O' THEN 'ok' ELSE 'warning' END AS status
  FROM pg_catalog.pg_event_trigger e`;

// jobname is only unique per username in pg_cron, so jobid is appended to
// keep the keyset cursor's sort_key unique.
const CRON_JOBS_SQL = `SELECT
    'cronJobs'::text AS category,
    COALESCE(jobname, format('job %s', jobid)) AS name,
    'pg_cron'::text AS badge,
    concat_ws(' · ', schedule, database, username) AS summary,
    command AS detail,
    format('%s:%s', COALESCE(jobname, jobid::text), jobid) AS sort_key,
    CASE WHEN active THEN 'ok' ELSE 'warning' END AS status
  FROM cron.job`;

const HAS_CRON_JOBS_SQL =
  "SELECT CASE WHEN pg_catalog.to_regclass('cron.job') IS NOT NULL AND pg_catalog.has_table_privilege('cron.job', 'SELECT') THEN 'true' ELSE 'false' END AS has_cron_job_table";

interface CategorySource {
  needsNamespaces: boolean;
  sql: string;
}

const CATEGORY_SOURCES: Record<OtherObjectCategory, CategorySource> = {
  collations: { needsNamespaces: true, sql: COLLATIONS_SQL },
  cronJobs: { needsNamespaces: false, sql: CRON_JOBS_SQL },
  eventTriggers: { needsNamespaces: false, sql: EVENT_TRIGGERS_SQL },
  fdwServers: { needsNamespaces: false, sql: FDW_SERVERS_SQL },
  replication: { needsNamespaces: false, sql: REPLICATION_SQL },
  routines: { needsNamespaces: true, sql: ROUTINES_SQL },
  sequences: { needsNamespaces: true, sql: SEQUENCES_SQL },
  types: { needsNamespaces: true, sql: TYPES_SQL },
};

/** Non-cron categories combined in one round trip for the overview. */
const SUMMARY_CATEGORY_ORDER: readonly OtherObjectCategory[] = [
  "routines",
  "sequences",
  "types",
  "collations",
  "fdwServers",
  "replication",
  "eventTriggers",
];

/**
 * Embeds arbitrary text as a single-quoted SQL literal. ExecuteQuery has no
 * bind parameters, so quote doubling is the injection boundary; NUL bytes are
 * dropped because PostgreSQL rejects them inside literals.
 */
function toSqlTextLiteral(value: string): string {
  return `'${value.replaceAll("\u0000", "").replaceAll("'", "''")}'`;
}

/**
 * Builds a `'%…%' ESCAPE '\'` contains-pattern literal. `%`, `_`, and `\` in
 * the user's search text are escaped so they match literally (names may
 * genuinely contain them).
 */
function toLikeContainsLiteral(value: string): string {
  const pattern = value
    .replaceAll("\u0000", "")
    .replaceAll(/[\\%_]/g, (match) => `\\${match}`)
    .replaceAll("'", "''");
  return `'%${pattern}%' ESCAPE '\\'`;
}

/**
 * Top rows per category plus exact totals, in one statement. Totals come from
 * a window count over the full category, so they stay correct no matter how
 * many objects exist.
 */
function buildOtherObjectsSummaryStatement(): string {
  const combined = SUMMARY_CATEGORY_ORDER.map(
    (category) => CATEGORY_SOURCES[category].sql
  ).join("\n  UNION ALL\n  ");
  return `WITH ${VISIBLE_NAMESPACES_CTE},
combined AS (
  ${combined}
),
ranked AS (
  SELECT
    combined.*,
    row_number() OVER (PARTITION BY category ORDER BY lower(sort_key), sort_key) AS row_rank,
    count(*) OVER (PARTITION BY category) AS category_total
  FROM combined
)
SELECT ${RESULT_COLUMNS}, category_total
FROM ranked
WHERE row_rank <= ${SUMMARY_ROWS_PER_CATEGORY}
ORDER BY category, lower(sort_key), sort_key`;
}

/** Cron summary runs separately: `cron.job` only exists with pg_cron. */
function buildCronJobsSummaryStatement(): string {
  return `SELECT ${RESULT_COLUMNS}, count(*) OVER () AS category_total
FROM (${CRON_JOBS_SQL}) AS cron_jobs
ORDER BY lower(sort_key), sort_key
LIMIT ${SUMMARY_ROWS_PER_CATEGORY}`;
}

interface BrowseStatementInput {
  afterSortKey?: string | undefined;
  category: OtherObjectCategory;
  search?: string | undefined;
}

/**
 * One page of a single category, keyset-paginated on the unique `sort_key`
 * and optionally filtered by name. Fetches one row beyond the page size so
 * the caller can tell whether more pages exist.
 */
function buildOtherObjectsBrowseStatement({
  afterSortKey,
  category,
  search,
}: BrowseStatementInput): string {
  const source = CATEGORY_SOURCES[category];
  const conditions: string[] = [];
  if (search) {
    conditions.push(`name ILIKE ${toLikeContainsLiteral(search)}`);
  }
  if (afterSortKey) {
    const cursor = toSqlTextLiteral(afterSortKey);
    conditions.push(
      `(lower(sort_key), sort_key) > (lower(${cursor}), ${cursor})`
    );
  }
  const prefix = source.needsNamespaces
    ? `WITH ${VISIBLE_NAMESPACES_CTE}\n`
    : "";
  const where =
    conditions.length > 0 ? `\nWHERE ${conditions.join("\n  AND ")}` : "";
  return `${prefix}SELECT ${RESULT_COLUMNS}
FROM (${source.sql}) AS category_objects${where}
ORDER BY lower(sort_key), sort_key
LIMIT ${BROWSE_PAGE_SIZE + 1}`;
}

export {
  BROWSE_PAGE_SIZE,
  buildCronJobsSummaryStatement,
  buildOtherObjectsBrowseStatement,
  buildOtherObjectsSummaryStatement,
  HAS_CRON_JOBS_SQL,
  SUMMARY_ROWS_PER_CATEGORY,
  toLikeContainsLiteral,
  toSqlTextLiteral,
};
