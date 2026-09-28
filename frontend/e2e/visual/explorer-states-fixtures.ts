import type { Page } from "playwright/test";
import { SchemaService } from "../../src/protogen/querylane/console/v1alpha1/schema_pb";
import { TableDataService } from "../../src/protogen/querylane/console/v1alpha1/table_data_pb";
import { TableService } from "../../src/protogen/querylane/console/v1alpha1/table_pb";
import { ViewService } from "../../src/protogen/querylane/console/v1alpha1/view_pb";
import {
  MATERIALIZED_VIEW_ID,
  materializedViewServices,
  schemaLoadErrorServices,
} from "../../src/test/fixtures/explorer-states-fixtures";
import {
  mockExplorerShell,
  mockTableCatalog,
} from "../tests/data-explorer-fixtures";
import { serveService } from "./serve-service";

const EXPLORER_URL = "/instances/production/databases/appdb/explorer";
const MATERIALIZED_VIEW_URL = `${EXPLORER_URL}?schema=public&category=views&name=${MATERIALIZED_VIEW_ID}`;

/** Data Explorer shell whose schema list request fails. */
async function mockSchemaLoadError(page: Page) {
  await mockExplorerShell(page);
  const services = schemaLoadErrorServices();
  await serveService(page, SchemaService, services.schema);
  await serveService(page, TableService, services.table);
}

/** Data Explorer with a populated materialized view selected on its data tab. */
async function mockMaterializedViewData(page: Page) {
  await mockExplorerShell(page);
  await mockTableCatalog(page);
  const services = materializedViewServices();
  await serveService(page, TableService, services.table);
  await serveService(page, TableDataService, services.tableData);
  await serveService(page, ViewService, services.view);
}

export {
  EXPLORER_URL,
  MATERIALIZED_VIEW_URL,
  mockMaterializedViewData,
  mockSchemaLoadError,
};
