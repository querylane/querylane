import type { Page } from "playwright/test";
import { TableDataService } from "../../src/protogen/querylane/console/v1alpha1/table_data_pb";
import { TableService } from "../../src/protogen/querylane/console/v1alpha1/table_pb";
import {
  type DataGridFixture,
  dataGridFixtureServices,
} from "../fixtures/data-grid.fixture";
import {
  mockExplorerShell,
  mockTableCatalog,
} from "../journeys/data-explorer.fixture";
import { serveService } from "./connect-rpc.test-utils";

const DATA_GRID_TABLE_URL = `/instances/production/databases/appdb/explorer?${new URLSearchParams(
  { category: "tables", name: "orders", schema: "public" }
)}`;
const LONG_SCHEMA_SUFFIX_LENGTH = 56;
const LONG_SCHEMA_NAME = `schema_${"x".repeat(LONG_SCHEMA_SUFFIX_LENGTH)}`;
const LONG_SCHEMA_CUSTOMERS_TABLE_NAME = `instances/production/databases/appdb/schemas/${LONG_SCHEMA_NAME}/tables/customers`;

async function mockDataGridExplorer(page: Page, fixture?: DataGridFixture) {
  await mockExplorerShell(page);
  await mockTableCatalog(page);
  const services = dataGridFixtureServices(fixture);
  await serveService(page, TableService, services.table);
  await serveService(page, TableDataService, services.tableData);
}

export {
  DATA_GRID_TABLE_URL,
  LONG_SCHEMA_CUSTOMERS_TABLE_NAME,
  LONG_SCHEMA_NAME,
  mockDataGridExplorer,
};
