import { create } from "@bufbuild/protobuf";
import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { ScreenshotFrame } from "@/__tests__/browser-test-utils";
import type { OtherDatabaseObject } from "@/components/console-pages/database-object-categories";
import { DatabaseObjectsPanel } from "@/components/console-pages/database-objects-section";
import type { OtherObjectsSummary } from "@/components/console-pages/other-database-objects-query";
import { ExtensionSchema } from "@/protogen/querylane/console/v1alpha1/extension_pb";

const designObjects: OtherDatabaseObject[] = [
  {
    badge: "ENUM",
    category: "types",
    detail: "",
    name: "shipping.shipment_status",
    sortKey: "1",
    summary: "booked, in_transit, customs_hold, delayed, delivered, cancelled",
  },
  {
    badge: "DOMAIN",
    category: "types",
    detail: "",
    name: "shipping.weight_class",
    sortKey: "2",
    summary: "numeric CHECK (VALUE > 0 AND VALUE < 100000)",
  },
  {
    badge: "COMPOSITE",
    category: "types",
    detail: "",
    name: "catalog.port_ref",
    sortKey: "3",
    summary: "(code text, name text, tz text)",
  },
  {
    badge: "FUNCTION",
    category: "routines",
    detail: "",
    name: "shipping.route_eta(leg_id bigint)",
    sortKey: "4",
    summary: "interval · plpgsql · stable",
  },
  {
    badge: "pg_cron",
    category: "cronJobs",
    detail: "CALL partman.run_maintenance_proc()",
    name: "partman-maintenance",
    sortKey: "partman-maintenance",
    status: "ok",
    summary: "0 3 * * * · postgres · app",
  },
];

function toSummary(objects: OtherDatabaseObject[]): OtherObjectsSummary {
  const summary: OtherObjectsSummary = {};
  for (const object of objects) {
    const entry = summary[object.category] ?? { objects: [], total: 0 };
    entry.objects.push(object);
    entry.total = entry.objects.length;
    summary[object.category] = entry;
  }
  return summary;
}

const designExtensions = [
  create(ExtensionSchema, {
    comment: "cryptographic functions",
    displayName: "pgcrypto",
    installed: true,
    installedVersion: "1.3",
    name: "instances/prod/databases/app/extensions/pgcrypto",
  }),
  create(ExtensionSchema, {
    comment: "PL/pgSQL procedural language",
    displayName: "plpgsql",
    installed: true,
    installedVersion: "1.0",
    name: "instances/prod/databases/app/extensions/plpgsql",
  }),
];

function renderPanel(objects = designObjects) {
  render(
    <ScreenshotFrame>
      <div className="w-[1060px] rounded-2xl bg-background p-8 text-foreground">
        <DatabaseObjectsPanel
          extensions={designExtensions}
          extensionsPending={false}
          isLoading={false}
          params={{ databaseId: "app", instanceId: "prod" }}
          summary={toSummary(objects)}
        />
      </div>
    </ScreenshotFrame>
  );
}

test("database objects grid shows every category card at once", async () => {
  renderPanel();

  await expect.element(page.getByText("Database objects")).toBeVisible();
  await expect.element(page.getByText("Extensions")).toBeVisible();
  await expect.element(page.getByText("pgcrypto")).toBeVisible();
  await expect.element(page.getByText("Routines")).toBeVisible();
  await expect.element(page.getByText("route_eta")).toBeVisible();
  await expect.element(page.getByText("→ interval")).toBeVisible();
  await expect.element(page.getByText("plpgsql · stable")).toBeVisible();
  await expect.element(page.getByText("Types")).toBeVisible();
  await expect.element(page.getByText("shipment_status")).toBeVisible();
  await expect.element(page.getByText("weight_class")).toBeVisible();
  await expect.element(page.getByText("port_ref")).toBeVisible();
  await expect.element(page.getByText("Cron jobs")).toBeVisible();
  await expect.element(page.getByText("partman-maintenance")).toBeVisible();
  await expect.element(page.getByText("0 3 * * *")).toBeVisible();

  await expect(page.getByTestId("screenshot-frame")).toMatchScreenshot(
    "database-objects-grid"
  );
});

test("database objects keeps its layout stable while loading", async () => {
  render(
    <ScreenshotFrame>
      <div className="w-[1060px] rounded-2xl bg-background p-8 text-foreground">
        <DatabaseObjectsPanel
          extensions={[]}
          extensionsPending={true}
          isLoading={true}
          params={{ databaseId: "app", instanceId: "prod" }}
          summary={{}}
        />
      </div>
    </ScreenshotFrame>
  );

  await expect
    .element(
      page.getByRole("status", { name: "Loading other database objects" })
    )
    .toBeVisible();
  await expect(page.getByTestId("screenshot-frame")).toMatchScreenshot(
    "database-objects-loading"
  );
});
