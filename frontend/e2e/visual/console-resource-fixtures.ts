import type { Page } from "playwright/test";
import { ConsoleService } from "../../src/protogen/querylane/console/v1alpha1/console_pb";
import { DatabaseService } from "../../src/protogen/querylane/console/v1alpha1/database_pb";
import { ExtensionService } from "../../src/protogen/querylane/console/v1alpha1/extension_pb";
import { InstanceService } from "../../src/protogen/querylane/console/v1alpha1/instance_pb";
import { MetricsService } from "../../src/protogen/querylane/console/v1alpha1/metrics_pb";
import { SchemaService } from "../../src/protogen/querylane/console/v1alpha1/schema_pb";
import { SQLService } from "../../src/protogen/querylane/console/v1alpha1/sql_pb";
import { TableService } from "../../src/protogen/querylane/console/v1alpha1/table_pb";
import { ViewService } from "../../src/protogen/querylane/console/v1alpha1/view_pb";
import {
  ADMIN_SHELL_FIXTURE,
  CONSOLE_DATABASE_ID,
  CONSOLE_FIXED_NOW,
  CONSOLE_INSTANCE_ID,
  type ConsoleResourceFixture,
  consoleResourceFixture,
  consoleResourceServices,
  LONG_DATABASE_NAME,
} from "../../src/test/fixtures/console-resource-fixtures";
import { fulfillJson, mockReadyOnboarding, mockRpc } from "../tests/helpers";
import { serveService } from "./serve-service";

const INSTANCE_URL = `/instances/${CONSOLE_INSTANCE_ID}`;
const ACTIVITY_URL = `${INSTANCE_URL}/activity`;
const CONFIGURATION_URL = `${INSTANCE_URL}/configuration`;
const DATABASE_URL = `${INSTANCE_URL}/databases/${CONSOLE_DATABASE_ID}`;
const EXTENSIONS_URL = `${DATABASE_URL}/extensions`;
const CONNECT_ENVELOPE_HEADER_BYTES = 5;
const END_STREAM_FLAG = 0b10;

/** A Connect server stream that ends immediately with no messages. */
async function mockEmptySqlStream(page: Page) {
  const endStream = Buffer.from("{}");
  const envelope = Buffer.alloc(
    CONNECT_ENVELOPE_HEADER_BYTES + endStream.length
  );
  envelope.writeUInt8(END_STREAM_FLAG, 0);
  envelope.writeUInt32BE(endStream.length, 1);
  endStream.copy(envelope, CONNECT_ENVELOPE_HEADER_BYTES);
  await page.route(
    `**/${SQLService.typeName}/${SQLService.method.executeQuery.name}`,
    (route) =>
      route.fulfill({
        body: envelope,
        headers: { "Content-Type": "application/connect+json" },
      })
  );
}

/**
 * Serves the shared console fixture behind the real app shell, with the clock
 * frozen so refresh times and relative ages render identically. Returns the
 * fixture so a test can change it between loads.
 */
async function mockConsoleResources(
  page: Page,
  {
    degraded = false,
    ...overrides
  }: Partial<ConsoleResourceFixture> & {
    /** The meta database is down, so the shell runs in degraded mode. */
    degraded?: boolean;
  } = {}
) {
  const fixture = consoleResourceFixture(overrides);
  const services = consoleResourceServices(fixture);
  await page.clock.setFixedTime(CONSOLE_FIXED_NOW);
  // Header star count comes from GitHub; keep it off the network.
  await page.route("https://api.github.com/**", (route) =>
    fulfillJson(route, { stargazers_count: 1200 })
  );
  await (degraded
    ? mockRpc(page, "OnboardingService/GetOnboardingState", {
        appDatabaseStatus: { schemaVersion: 1, state: "STATE_ERROR" },
        availableMethods: [],
        configFilePath: "/tmp/querylane/config.yaml",
        homePath: "/tmp/querylane",
        isConfigured: true,
        isHomeWritable: true,
      })
    : mockReadyOnboarding(page));
  await Promise.all([
    serveService(page, ConsoleService, services.console),
    serveService(page, DatabaseService, services.database),
    serveService(page, ExtensionService, services.extension),
    serveService(page, InstanceService, services.instance),
    serveService(page, MetricsService, services.metrics),
    serveService(page, SchemaService, services.schema),
    serveService(page, TableService, services.table),
    serveService(page, ViewService, services.view),
    mockEmptySqlStream(page),
  ]);
  return fixture;
}

/** The database overview inside the full app shell, config-managed. */
async function openAdminShell(page: Page, { degraded = false } = {}) {
  await mockConsoleResources(page, { ...ADMIN_SHELL_FIXTURE, degraded });
  await page.goto(DATABASE_URL);
  await page
    .getByRole("main")
    .last()
    .getByRole("heading", { name: LONG_DATABASE_NAME })
    .waitFor();
}

export {
  ACTIVITY_URL,
  CONFIGURATION_URL,
  DATABASE_URL,
  EXTENSIONS_URL,
  INSTANCE_URL,
  mockConsoleResources,
  openAdminShell,
};
