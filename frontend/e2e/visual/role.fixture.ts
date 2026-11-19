import type { Page } from "playwright/test";
import { DatabaseService } from "../../src/protogen/querylane/console/v1alpha1/database_pb";
import { RoleService } from "../../src/protogen/querylane/console/v1alpha1/role_pb";
import {
  type RoleFixture,
  roleFixtureServices,
} from "../fixtures/role.fixture";
import {
  mockApiManagedReadyConsole,
  mockInstanceCatalog,
  mockInstanceDetails,
  mockReadyOnboarding,
  sampleInstance,
} from "../journeys/querylane-rpc.fixture";
import { serveService } from "./connect-rpc.test-utils";

export async function mockRolesScreen(page: Page, fixture: RoleFixture) {
  await mockReadyOnboarding(page);
  await mockApiManagedReadyConsole(page);
  await mockInstanceCatalog(page, [sampleInstance]);
  await mockInstanceDetails(page, sampleInstance);
  const services = roleFixtureServices(fixture);
  await serveService(page, DatabaseService, services.database);
  await serveService(page, RoleService, services.role);
}
