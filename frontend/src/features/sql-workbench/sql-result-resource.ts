/**
 * Query results have no table of their own, but the shared grid's exports
 * and "Copy as SQL INSERT" name one. This placeholder resource produces
 * `query_result.*` files and `INSERT INTO "workbench"."query_result"`.
 */
const QUERY_RESULT_RESOURCE_NAME =
  "instances/workbench/databases/workbench/schemas/workbench/tables/query_result";

export { QUERY_RESULT_RESOURCE_NAME };
