import { createClient, type Transport } from "@connectrpc/connect";
import { useTransport } from "@connectrpc/connect-query";
import { useQuery } from "@tanstack/react-query";
import type { OtherDatabaseObject } from "@/features/data-explorer/other-database-objects-section";
import { buildDatabaseName } from "@/lib/console-resources";
import { RESOURCE_QUERY_OPTIONS } from "@/lib/query-policy";
import { SQLService } from "@/protogen/querylane/console/v1alpha1/sql_pb";
import type {
  TableResultRow,
  TableValue,
} from "@/protogen/querylane/console/v1alpha1/table_data_pb";

const OTHER_DATABASE_OBJECTS_DISPLAY_LIMIT = 1000;
const OTHER_DATABASE_OBJECTS_ROW_LIMIT =
  OTHER_DATABASE_OBJECTS_DISPLAY_LIMIT + 1;
const OTHER_DATABASE_OBJECTS_BATCH_SIZE = 100;

const MAIN_OTHER_DATABASE_OBJECTS_SQL = `
-- Querylane supports PostgreSQL 14 and newer.
WITH visible_namespaces AS (
  SELECT oid, nspname
  FROM pg_catalog.pg_namespace
  WHERE nspname NOT IN ('pg_catalog', 'information_schema')
    AND nspname !~ '^pg_toast'
    AND nspname !~ '^pg_temp_'
),
routine_objects AS (
  SELECT
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
    CASE
      WHEN p.prokind IN ('f', 'p', 'w') THEN pg_catalog.pg_get_functiondef(p.oid)
      ELSE ''
    END AS definition,
    ''::text AS extra,
    ''::text AS values,
    format('%s:%s:%s', n.nspname, p.proname, p.oid) AS sort_key,
    ''::text AS status
  FROM pg_catalog.pg_proc p
  JOIN visible_namespaces n ON n.oid = p.pronamespace
  JOIN pg_catalog.pg_language l ON l.oid = p.prolang
),
sequence_objects AS (
  SELECT
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
    format(
      'CREATE SEQUENCE %I.%I INCREMENT BY %s MINVALUE %s MAXVALUE %s START WITH %s CACHE %s%s;',
      n.nspname,
      c.relname,
      s.seqincrement,
      s.seqmin,
      s.seqmax,
      s.seqstart,
      s.seqcache,
      CASE WHEN s.seqcycle THEN ' CYCLE' ELSE '' END
    ) AS definition,
    ''::text AS extra,
    ''::text AS values,
    format('%s:%s', n.nspname, c.relname) AS sort_key,
    ''::text AS status
  FROM pg_catalog.pg_class c
  JOIN visible_namespaces n ON n.oid = c.relnamespace
  JOIN pg_catalog.pg_sequence s ON s.seqrelid = c.oid
  WHERE c.relkind = 'S'
),
type_objects AS (
  SELECT
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
    CASE t.typtype
      WHEN 'e' THEN format('CREATE TYPE %I.%I AS ENUM (%s);', n.nspname, t.typname, COALESCE(enum_labels.quoted_labels, ''))
      WHEN 'd' THEN format('CREATE DOMAIN %I.%I AS %s%s;', n.nspname, t.typname, pg_catalog.format_type(t.typbasetype, t.typtypmod), CASE WHEN domain_checks.checks <> '' THEN concat(' ', domain_checks.checks) ELSE '' END)
      WHEN 'c' THEN format('CREATE TYPE %I.%I AS (%s);', n.nspname, t.typname, COALESCE(composite_attrs.attrs, ''))
      WHEN 'r' THEN format('CREATE TYPE %I.%I AS RANGE (SUBTYPE = %s);', n.nspname, t.typname, pg_catalog.format_type(r.rngsubtype, NULL::integer))
      ELSE ''
    END AS definition,
    ''::text AS extra,
    CASE WHEN t.typtype = 'e' THEN COALESCE(enum_labels.labels_json, '[]') ELSE '[]' END AS values,
    format('%s:%s', n.nspname, t.typname) AS sort_key,
    ''::text AS status
  FROM pg_catalog.pg_type t
  JOIN visible_namespaces n ON n.oid = t.typnamespace
  LEFT JOIN pg_catalog.pg_class cls ON cls.oid = t.typrelid
  LEFT JOIN pg_catalog.pg_range r ON r.rngtypid = t.oid
  LEFT JOIN LATERAL (
    SELECT
      pg_catalog.string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder) AS labels,
      pg_catalog.string_agg(pg_catalog.quote_literal(e.enumlabel), ', ' ORDER BY e.enumsortorder) AS quoted_labels,
      COALESCE(pg_catalog.jsonb_agg(e.enumlabel ORDER BY e.enumsortorder), '[]'::jsonb)::text AS labels_json
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
    AND (t.typtype <> 'c' OR cls.relkind = 'c')
),
collation_objects AS (
  SELECT
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
    format(
      'CREATE COLLATION %s (provider = %s, locale = %s, deterministic = %s);',
      CASE WHEN n.nspname = 'public' THEN pg_catalog.quote_ident(c.collname) ELSE format('%I.%I', n.nspname, c.collname) END,
      CASE c.collprovider WHEN 'i' THEN 'icu' WHEN 'c' THEN 'libc' WHEN 'b' THEN 'builtin' ELSE c.collprovider::text END,
      pg_catalog.quote_literal(COALESCE(NULLIF(pg_catalog.to_jsonb(c)->>'colllocale', ''), NULLIF(pg_catalog.to_jsonb(c)->>'colliculocale', ''), c.collcollate)),
      CASE WHEN c.collisdeterministic THEN 'true' ELSE 'false' END
    ) AS definition,
    ''::text AS extra,
    ''::text AS values,
    format('%s:%s', n.nspname, c.collname) AS sort_key,
    ''::text AS status
  FROM pg_catalog.pg_collation c
  JOIN visible_namespaces n ON n.oid = c.collnamespace
  WHERE c.collname <> 'default'
),
fdw_objects AS (
  SELECT
    'fdwServers'::text AS category,
    s.srvname AS name,
    w.fdwname AS badge,
    concat_ws(' · ', options.summary, COALESCE(pg_catalog.obj_description(s.oid, 'pg_foreign_server'), '')) AS summary,
    ''::text AS detail,
    format(
      'CREATE SERVER %I FOREIGN DATA WRAPPER %I%s;',
      s.srvname,
      w.fdwname,
      CASE WHEN options.definition = '' THEN '' ELSE concat(' OPTIONS (', options.definition, ')') END
    ) AS definition,
    ''::text AS extra,
    ''::text AS values,
    s.srvname AS sort_key,
    ''::text AS status
  FROM pg_catalog.pg_foreign_server s
  JOIN pg_catalog.pg_foreign_data_wrapper w ON w.oid = s.srvfdw
  LEFT JOIN LATERAL (
    SELECT
      COALESCE(pg_catalog.string_agg(option, ', ' ORDER BY option), '') AS summary,
      COALESCE(
        pg_catalog.string_agg(
          format(
            '%I %L',
            pg_catalog.left(option, pg_catalog.strpos(option, '=') - 1),
            pg_catalog.substr(option, pg_catalog.strpos(option, '=') + 1)
          ),
          ', ' ORDER BY option
        ),
        ''
      ) AS definition
    FROM pg_catalog.unnest(s.srvoptions) AS option
  ) options ON true
),
replication_publications AS (
  SELECT
    'replication'::text AS category,
    p.pubname AS name,
    'PUBLICATION'::text AS badge,
    concat_ws(
      ' · ',
      CASE WHEN p.puballtables THEN 'all tables' ELSE 'selected tables' END,
      concat_ws(', ', CASE WHEN p.pubinsert THEN 'insert' END, CASE WHEN p.pubupdate THEN 'update' END, CASE WHEN p.pubdelete THEN 'delete' END, CASE WHEN p.pubtruncate THEN 'truncate' END)
    ) AS summary,
    ''::text AS detail,
    format(
      'CREATE PUBLICATION %I%s WITH (publish = %s);',
      p.pubname,
      CASE
        WHEN p.puballtables THEN ' FOR ALL TABLES'
        WHEN publication_tables.definition <> '' THEN concat(' FOR TABLE ', publication_tables.definition)
        ELSE ''
      END,
      pg_catalog.quote_literal(concat_ws(', ', CASE WHEN p.pubinsert THEN 'insert' END, CASE WHEN p.pubupdate THEN 'update' END, CASE WHEN p.pubdelete THEN 'delete' END, CASE WHEN p.pubtruncate THEN 'truncate' END))
    ) AS definition,
    ''::text AS extra,
    ''::text AS values,
    p.pubname AS sort_key,
    'ok'::text AS status
  FROM pg_catalog.pg_publication p
  LEFT JOIN LATERAL (
    SELECT COALESCE(
      pg_catalog.string_agg(format('%I.%I', schemaname, tablename), ', ' ORDER BY schemaname, tablename),
      ''
    ) AS definition
    FROM pg_catalog.pg_publication_tables publication_table
    WHERE publication_table.pubname = p.pubname
  ) publication_tables ON true
),
event_trigger_objects AS (
  SELECT
    'eventTriggers'::text AS category,
    e.evtname AS name,
    concat('ON ', e.evtevent) AS badge,
    COALESCE(pg_catalog.obj_description(e.oid, 'pg_event_trigger'), '') AS summary,
    format('→ %s', e.evtfoid::regprocedure::text) AS detail,
    format(
      'CREATE EVENT TRIGGER %I ON %s EXECUTE FUNCTION %s;',
      e.evtname,
      e.evtevent,
      e.evtfoid::regprocedure::text
    ) AS definition,
    ''::text AS extra,
    ''::text AS values,
    e.evtname AS sort_key,
    CASE e.evtenabled WHEN 'O' THEN 'ok' ELSE 'warning' END AS status
  FROM pg_catalog.pg_event_trigger e
)
SELECT category, name, badge, summary, detail, definition, extra, values, sort_key, status
FROM (
  SELECT * FROM routine_objects
  UNION ALL SELECT * FROM sequence_objects
  UNION ALL SELECT * FROM type_objects
  UNION ALL SELECT * FROM collation_objects
  UNION ALL SELECT * FROM fdw_objects
  UNION ALL SELECT * FROM replication_publications
  UNION ALL SELECT * FROM event_trigger_objects
) objects
ORDER BY
  CASE category
    WHEN 'routines' THEN 1
    WHEN 'sequences' THEN 2
    WHEN 'types' THEN 3
    WHEN 'collations' THEN 4
    WHEN 'fdwServers' THEN 5
    WHEN 'replication' THEN 6
    WHEN 'eventTriggers' THEN 7
    ELSE 8
  END,
  lower(sort_key)
`;

const HAS_CRON_JOBS_SQL =
  "SELECT CASE WHEN pg_catalog.to_regclass('cron.job') IS NOT NULL AND pg_catalog.has_table_privilege('cron.job', 'SELECT') THEN 'true' ELSE 'false' END AS has_cron_job_table";

const CRON_JOBS_SQL = `
SELECT
  'cronJobs'::text AS category,
  COALESCE(jobname, format('job %s', jobid)) AS name,
  'pg_cron'::text AS badge,
  concat_ws(' · ', schedule, database, username) AS summary,
  command AS detail,
  format('SELECT cron.schedule(%L, %L, %L);', COALESCE(jobname, format('job %s', jobid)), schedule, command) AS definition,
  CASE WHEN active THEN 'active' ELSE 'paused' END AS extra,
  '[]'::text AS values,
  COALESCE(jobname, jobid::text) AS sort_key,
  CASE WHEN active THEN 'ok' ELSE 'warning' END AS status
FROM cron.job
ORDER BY lower(COALESCE(jobname, jobid::text))
`;

type QueryRow = Record<string, string>;
type OtherObjectsRowExecutor = (input: {
  parent: string;
  statement: string;
}) => Promise<QueryRow[]>;

function tableValueToText(value: TableValue | undefined): string {
  const kind = value?.kind;
  if (!kind || kind.case === undefined || kind.case === "nullValue") {
    return "";
  }
  switch (kind.case) {
    case "boolValue":
      return kind.value ? "true" : "false";
    case "bytesValue":
      return "";
    case "doubleValue":
      return String(kind.value);
    case "int64Value":
      return kind.value.toString();
    case "jsonValue":
      return kind.value;
    case "numericValue":
      return kind.value;
    case "stringValue":
      return kind.value;
    case "timestampValue":
      return kind.value;
    default:
      return assertNeverTableValueKind(kind);
  }
}

function assertNeverTableValueKind(_kind: never): never {
  throw new Error("Unexpected table value kind");
}

function rowToRecord(columns: string[], row: TableResultRow): QueryRow {
  const record: QueryRow = {};
  row.values.forEach((cell, index) => {
    const column = columns[index];
    if (!column) {
      return;
    }
    record[column] = tableValueToText(cell.value);
  });
  return record;
}

async function executeRows({
  parent,
  statement,
  transport,
}: {
  parent: string;
  statement: string;
  transport: Transport;
}): Promise<QueryRow[]> {
  const client = createClient(SQLService, transport);
  const rows: QueryRow[] = [];
  let columns: string[] = [];

  for await (const response of client.executeQuery({
    batchSize: OTHER_DATABASE_OBJECTS_BATCH_SIZE,
    parent,
    rowLimit: OTHER_DATABASE_OBJECTS_ROW_LIMIT,
    statement,
  })) {
    const { result } = response;
    if (result.case === undefined) {
      continue;
    }
    switch (result.case) {
      case "columnMetadata":
        columns = result.value.columns.map((column) => column.columnName);
        break;
      case "rowBatch":
        rows.push(...result.value.rows.map((row) => rowToRecord(columns, row)));
        break;
      case "stats":
        break;
      default:
        assertNeverExecuteResult(result);
    }
  }

  return rows;
}

function assertNeverExecuteResult(_result: never): never {
  throw new Error("Unexpected execute query result");
}

function queryRowToObject(row: QueryRow): OtherDatabaseObject | null {
  const { category } = row;
  if (!isOtherDatabaseObjectCategory(category)) {
    return null;
  }

  return {
    badge: row["badge"] ?? "",
    category,
    definition: row["definition"] ?? "",
    detail: row["detail"] ?? "",
    extra: row["extra"] ?? "",
    name: row["name"] ?? "",
    sortKey: row["sort_key"] ?? row["name"] ?? "",
    status: parseObjectStatus(row["status"]),
    summary: row["summary"] ?? "",
    values: parseObjectValues(row["values"]),
  };
}

function parseObjectValues(values: string | undefined): string[] | undefined {
  if (!values) {
    return;
  }
  const parsed: unknown = JSON.parse(values);
  if (
    !(
      Array.isArray(parsed) &&
      parsed.every((value) => typeof value === "string")
    )
  ) {
    throw new Error("Invalid database object values");
  }
  return parsed;
}

function parseObjectStatus(status: string | undefined) {
  switch (status) {
    case "failed":
    case "ok":
    case "warning":
      return status;
    case "":
    case undefined:
      return;
    default:
      return "warning";
  }
}

function isOtherDatabaseObjectCategory(
  category: string | undefined
): category is OtherDatabaseObject["category"] {
  return (
    category === "routines" ||
    category === "sequences" ||
    category === "types" ||
    category === "collations" ||
    category === "fdwServers" ||
    category === "replication" ||
    category === "eventTriggers" ||
    category === "cronJobs"
  );
}

async function fetchOtherDatabaseObjects({
  execute,
  parent,
}: {
  execute: OtherObjectsRowExecutor;
  parent: string;
}) {
  const mainRows = await execute({
    parent,
    statement: MAIN_OTHER_DATABASE_OBJECTS_SQL,
  });
  const hasCronRows = await execute({
    parent,
    statement: HAS_CRON_JOBS_SQL,
  });
  const hasCron = hasCronRows[0]?.["has_cron_job_table"] === "true";
  const cronRows = hasCron
    ? await execute({ parent, statement: CRON_JOBS_SQL })
    : [];
  const rows = [...mainRows, ...cronRows];

  return {
    isTruncated: rows.length > OTHER_DATABASE_OBJECTS_DISPLAY_LIMIT,
    objects: rows
      .slice(0, OTHER_DATABASE_OBJECTS_DISPLAY_LIMIT)
      .map(queryRowToObject)
      .filter((object): object is OtherDatabaseObject => object !== null),
  };
}

function useOtherDatabaseObjectsQuery({
  databaseId,
  instanceId,
}: {
  databaseId: string;
  instanceId: string;
}) {
  const transport = useTransport();
  const parent = buildDatabaseName(instanceId, databaseId);

  return useQuery({
    enabled: Boolean(databaseId && instanceId),
    queryFn: () =>
      fetchOtherDatabaseObjects({
        execute: ({ parent: queryParent, statement }) =>
          executeRows({ parent: queryParent, statement, transport }),
        parent,
      }),
    queryKey: ["console", "database", "other-objects", parent] as const,
    ...RESOURCE_QUERY_OPTIONS.schemaList,
  });
}

export {
  fetchOtherDatabaseObjects,
  queryRowToObject,
  rowToRecord,
  tableValueToText,
  useOtherDatabaseObjectsQuery,
};
