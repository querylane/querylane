import type { Page } from "playwright/test";
import { DatabaseService } from "../../src/protogen/querylane/console/v1alpha1/database_pb";
import { RoleService } from "../../src/protogen/querylane/console/v1alpha1/role_pb";
import {
  type RoleFixture,
  roleFixtureServices,
} from "../../src/test/fixtures/role-fixtures";
import {
  mockApiManagedReadyConsole,
  mockInstanceCatalog,
  mockInstanceDetails,
  mockReadyOnboarding,
  sampleInstance,
} from "../tests/helpers";
import { serveService } from "./serve-service";

/** Serves the shared role fixture behind the real instance shell. */
export async function mockRolesScreen(page: Page, fixture: RoleFixture) {
  await mockReadyOnboarding(page);
  await mockApiManagedReadyConsole(page);
  await mockInstanceCatalog(page, [sampleInstance]);
  await mockInstanceDetails(page, sampleInstance);
  const services = roleFixtureServices(fixture);
  await serveService(page, DatabaseService, services.database);
  await serveService(page, RoleService, services.role);
}
