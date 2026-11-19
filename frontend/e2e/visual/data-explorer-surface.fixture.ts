import type { Page } from "playwright/test";

import { SchemaService } from "../../src/protogen/querylane/console/v1alpha1/schema_pb";
import { SQLService } from "../../src/protogen/querylane/console/v1alpha1/sql_pb";
import { TableDataService } from "../../src/protogen/querylane/console/v1alpha1/table_data_pb";
import { TableService } from "../../src/protogen/querylane/console/v1alpha1/table_pb";
import { ViewService } from "../../src/protogen/querylane/console/v1alpha1/view_pb";
import {
  type ExplorerSurfaceCatalog,
  explorerSurfaceServices,
} from "../fixtures/data-explorer-surface.fixture";
import { mockExplorerShell } from "../journeys/data-explorer.fixture";
import { serveService } from "./connect-rpc.test-utils";

const EXPLORER_URL = "/instances/production/databases/appdb/explorer";

function explorerUrl(search: Record<string, string> = {}) {
  const query = new URLSearchParams(search).toString();
  return query ? `${EXPLORER_URL}?${query}` : EXPLORER_URL;
}

async function mockExplorerSurfaces(
  page: Page,
  catalog: ExplorerSurfaceCatalog
) {
  await mockExplorerShell(page);
  const services = explorerSurfaceServices(catalog);
  await serveService(page, SchemaService, services.schema);
  await serveService(page, TableService, services.table);
  await serveService(page, ViewService, services.view);
  await serveService(page, SQLService, services.sql);
  await serveService(page, TableDataService, services.tableData);
}

export { explorerUrl, mockExplorerSurfaces };
