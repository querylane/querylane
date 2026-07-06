import type { View } from "@/protogen/querylane/console/v1alpha1/view_pb";
import { View_ViewType } from "@/protogen/querylane/console/v1alpha1/view_pb";

// Best-effort UI hints only. These regexes intentionally avoid becoming a SQL
// parser, so comments/string literals can still produce false positives.
const SQL_SOURCE_PATTERN =
  /\b(?:from|join)\s+((?:"[^"]+"|[a-zA-Z_][\w$]*)(?:\s*\.\s*(?:"[^"]+"|[a-zA-Z_][\w$]*))?)/gi;
const SQL_IDENTIFIER_DOT_PATTERN = /\s*\.\s*/g;
const SQL_AGGREGATE_PATTERN = /\bgroup\s+by\b|\b(count|sum|avg|min|max)\s*\(/i;
const SQL_FILTER_PATTERN = /\bwhere\b|\bhaving\b/i;
const SQL_JOIN_PATTERN = /\bjoin\b/i;
const SQL_DISTINCT_PATTERN = /\bdistinct\b/i;
const SQL_SET_OPERATION_PATTERN = /\b(union|intersect|except)\b/i;
const SQL_TRAILING_SEMICOLON_PATTERN = /;+\s*$/;
const RUNNABLE_VIEW_DEFINITION_PATTERN =
  /^\s*create\s+(?:or\s+replace\s+)?(?:materialized\s+)?view\b/i;
const VIEW_RESOURCE_NAME_PATTERN =
  /^instances\/[^/]+\/databases\/[^/]+\/schemas\/([^/]+)\/views\/([^/]+)$/;
const VIEW_DATABASE_RESOURCE_NAME_PATTERN =
  /^(instances\/[^/]+\/databases\/[^/]+)\/schemas\/[^/]+\/views\/[^/]+$/;
const MAX_SOURCE_RELATIONS = 8;

function decodeResourceSegment(segment: string) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function quoteSqlIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function formatViewSqlIdentifier(view: View, fallbackViewName: string) {
  const match = VIEW_RESOURCE_NAME_PATTERN.exec(view.name);
  if (!(match?.[1] && match[2])) {
    return quoteSqlIdentifier(fallbackViewName);
  }
  return `${quoteSqlIdentifier(decodeResourceSegment(match[1]))}.${quoteSqlIdentifier(
    decodeResourceSegment(match[2])
  )}`;
}

function databaseResourceNameFromView(view: View) {
  return VIEW_DATABASE_RESOURCE_NAME_PATTERN.exec(view.name)?.[1] ?? "";
}

function stripTrailingSemicolon(sql: string) {
  return sql.replace(SQL_TRAILING_SEMICOLON_PATTERN, "");
}

function runnableViewDefinition({
  definition,
  view,
  viewName,
}: {
  definition: string;
  view: View;
  viewName: string;
}) {
  const trimmedDefinition = definition.trim();
  if (
    trimmedDefinition.length === 0 ||
    RUNNABLE_VIEW_DEFINITION_PATTERN.test(trimmedDefinition)
  ) {
    return trimmedDefinition;
  }

  const createStatement =
    view.viewType === View_ViewType.MATERIALIZED
      ? "CREATE MATERIALIZED VIEW"
      : "CREATE VIEW";
  return `${createStatement} ${formatViewSqlIdentifier(
    view,
    viewName
  )} AS\n${stripTrailingSemicolon(trimmedDefinition)};`;
}

function cleanSqlIdentifier(identifier: string) {
  return identifier
    .replaceAll('"', "")
    .replace(SQL_IDENTIFIER_DOT_PATTERN, ".");
}

function sourceRelationsFromDefinition(definition: string) {
  const sources = new Set<string>();
  for (const match of definition.matchAll(SQL_SOURCE_PATTERN)) {
    const source = match[1];
    if (!source) {
      continue;
    }
    sources.add(cleanSqlIdentifier(source));
    if (sources.size >= MAX_SOURCE_RELATIONS) {
      break;
    }
  }
  return Array.from(sources);
}

function queryShapeFromDefinition(definition: string) {
  const shape: string[] = [];
  if (SQL_AGGREGATE_PATTERN.test(definition)) {
    shape.push("Aggregates rows");
  }
  if (SQL_FILTER_PATTERN.test(definition)) {
    shape.push("Filters rows");
  }
  if (SQL_JOIN_PATTERN.test(definition)) {
    shape.push("Joins sources");
  }
  if (SQL_DISTINCT_PATTERN.test(definition)) {
    shape.push("Deduplicates rows");
  }
  if (SQL_SET_OPERATION_PATTERN.test(definition)) {
    shape.push("Combines queries");
  }
  return shape.length > 0 ? shape : ["Projects columns"];
}

export {
  databaseResourceNameFromView,
  formatViewSqlIdentifier,
  queryShapeFromDefinition,
  runnableViewDefinition,
  sourceRelationsFromDefinition,
};
