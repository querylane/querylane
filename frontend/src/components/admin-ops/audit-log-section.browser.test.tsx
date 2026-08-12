import { create as createProto } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { ScreenshotFrame } from "@/__tests__/browser-test-utils";
import { AuditLogSection } from "@/components/admin-ops/audit-log-section";
import {
  AuditLogEntry_Status,
  AuditLogEntrySchema,
  ListAuditLogEntriesResponseSchema,
} from "@/protogen/querylane/console/v1alpha1/admin_pb";

vi.mock("@/hooks/api/admin", () => ({
  useAuditLogEntriesInfiniteQuery: () => ({
    data: {
      pages: [
        createProto(ListAuditLogEntriesResponseSchema, {
          auditLogEntries: [
            createProto(AuditLogEntrySchema, {
              action: "refresh_materialized_view",
              actor: "10.42.7.19:54321",
              database: "warehouse",
              finishedAt: timestampFromDate(new Date("2026-08-12T12:00:01Z")),
              instance: "instances/prod-analytics",
              resultSummary: "refreshed",
              startedAt: timestampFromDate(new Date("2026-08-12T12:00:00Z")),
              statement:
                'REFRESH MATERIALIZED VIEW CONCURRENTLY "analytics"."daily_revenue"',
              status: AuditLogEntry_Status.SUCCEEDED,
              target:
                "instances/prod-analytics/databases/warehouse/schemas/analytics/views/daily_revenue",
            }),
            createProto(AuditLogEntrySchema, {
              action: "refresh_materialized_view",
              actor: "10.42.7.20:62113",
              database: "customer_events",
              finishedAt: timestampFromDate(new Date("2026-08-12T11:54:35Z")),
              instance: "instances/eu-customer-events",
              resultSummary: "operation failed",
              startedAt: timestampFromDate(new Date("2026-08-12T11:54:30Z")),
              statement:
                'REFRESH MATERIALIZED VIEW "reporting"."weekly_retention_by_channel"',
              status: AuditLogEntry_Status.FAILED,
              target:
                "instances/eu-customer-events/databases/customer_events/schemas/reporting/views/weekly_retention_by_channel",
            }),
            createProto(AuditLogEntrySchema, {
              action: "refresh_materialized_view",
              actor: "10.42.7.21:65002",
              database: "billing",
              instance: "instances/billing-primary",
              startedAt: timestampFromDate(new Date("2026-08-12T11:50:00Z")),
              statement:
                'REFRESH MATERIALIZED VIEW "finance"."monthly_invoice_totals"',
              status: AuditLogEntry_Status.STARTED,
              target:
                "instances/billing-primary/databases/billing/schemas/finance/views/monthly_invoice_totals",
            }),
          ],
        }),
      ],
    },
    error: null,
    fetchNextPage: vi.fn(async () => undefined),
    hasNextPage: false,
    isFetchingNextPage: false,
    isPending: false,
    refetch: vi.fn(async () => undefined),
  }),
}));

test("audit log keeps mutation scope and outcome scannable", async () => {
  render(
    <ScreenshotFrame>
      <div className="w-[1180px] rounded-lg border border-border bg-background p-8 text-foreground">
        <AuditLogSection />
      </div>
    </ScreenshotFrame>
  );

  await expect.element(page.getByText("Mutation audit log")).toBeVisible();
  await expect.element(page.getByText("Succeeded")).toBeVisible();
  await expect.element(page.getByText("Failed")).toBeVisible();
  await expect.element(page.getByText("Started").last()).toBeVisible();
  await expect(page.getByTestId("screenshot-frame")).toMatchScreenshot(
    "admin-mutation-audit-log"
  );
});
