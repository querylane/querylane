import { create as createProto } from "@bufbuild/protobuf";
import { describe, expect, test } from "vitest";
import {
  databaseResourceNameFromView,
  formatViewSqlIdentifier,
  queryShapeFromDefinition,
  runnableViewDefinition,
  sourceRelationsFromDefinition,
} from "@/features/data-explorer/explorer-view-detail-model";
import {
  View_ViewType,
  ViewSchema,
} from "@/protogen/querylane/console/v1alpha1/view_pb";

describe("view detail model", () => {
  test("extracts best-effort source relations from FROM and JOIN clauses", () => {
    expect(
      sourceRelationsFromDefinition(`SELECT *
FROM "sales"."orders"
JOIN crm.customers ON customers.id = orders.customer_id
JOIN public.products p ON p.id = orders.product_id`)
    ).toEqual(["sales.orders", "crm.customers", "public.products"]);
  });

  test("labels query shape without pretending to parse SQL", () => {
    expect(
      queryShapeFromDefinition(
        "SELECT DISTINCT customer_id, count(*) FROM sales.orders WHERE paid GROUP BY 1"
      )
    ).toEqual(["Aggregates rows", "Filters rows", "Deduplicates rows"]);
    expect(queryShapeFromDefinition("SELECT id, email FROM app.users")).toEqual(
      ["Projects columns"]
    );
  });

  test("wraps bare SELECT definitions in copyable CREATE VIEW SQL", () => {
    const view = createProto(ViewSchema, {
      name: "instances/prod/databases/app/schemas/public/views/daily%20revenue",
      viewType: View_ViewType.STANDARD,
    });

    expect(
      runnableViewDefinition({
        definition: "SELECT * FROM sales.orders;",
        view,
        viewName: "daily revenue",
      })
    ).toBe(
      'CREATE VIEW "public"."daily revenue" AS\nSELECT * FROM sales.orders;'
    );
  });

  test("keeps existing CREATE VIEW definitions unchanged after trimming", () => {
    const view = createProto(ViewSchema, {
      name: "instances/prod/databases/app/schemas/public/views/report",
      viewType: View_ViewType.MATERIALIZED,
    });

    expect(
      runnableViewDefinition({
        definition: "  CREATE MATERIALIZED VIEW public.report AS SELECT 1;  ",
        view,
        viewName: "report",
      })
    ).toBe("CREATE MATERIALIZED VIEW public.report AS SELECT 1;");
  });

  test("derives database and quoted view identifiers from resource names", () => {
    const view = createProto(ViewSchema, {
      name: "instances/prod/databases/app/schemas/sales%20ops/views/report%22daily",
    });

    expect(databaseResourceNameFromView(view)).toBe(
      "instances/prod/databases/app"
    );
    expect(formatViewSqlIdentifier(view, "fallback")).toBe(
      '"sales ops"."report""daily"'
    );
  });
});
