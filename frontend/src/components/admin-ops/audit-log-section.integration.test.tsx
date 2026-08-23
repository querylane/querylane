import { create as createProto } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { afterEach, expect, rs, test } from "@rstest/core";
import { cleanup, render, screen } from "@testing-library/react";
import { AuditLogSection } from "@/components/admin-ops/audit-log-section";
import {
  AuditLogEntry_Action,
  AuditLogEntry_State,
  AuditLogEntrySchema,
  ListAuditLogEntriesResponseSchema,
} from "@/protogen/querylane/console/v1alpha1/admin_pb";

const state = rs.hoisted(() => ({
  fetchNextPage: rs.fn(async () => undefined),
}));

rs.mock("@/hooks/api/admin", () => ({
  useAuditLogEntriesInfiniteQuery: () => ({
    data: {
      pages: [
        createProto(ListAuditLogEntriesResponseSchema, {
          auditLogEntries: [
            createProto(AuditLogEntrySchema, {
              action: AuditLogEntry_Action.REFRESH_MATERIALIZED_VIEW,
              actor: "127.0.0.1:54321",
              command: 'REFRESH MATERIALIZED VIEW "public"."revenue"',
              database: "instances/prod/databases/app",
              finishTime: timestampFromDate(new Date("2026-08-12T12:00:01Z")),
              instance: "instances/prod",
              resultSummary: "refreshed concurrently",
              startTime: timestampFromDate(new Date("2026-08-12T12:00:00Z")),
              state: AuditLogEntry_State.SUCCEEDED,
              target: "public.daily_revenue",
            }),
          ],
        }),
      ],
    },
    error: null,
    fetchNextPage: state.fetchNextPage,
    hasNextPage: false,
    isFetchingNextPage: false,
    isPending: false,
    refetch: rs.fn(),
  }),
}));

afterEach(() => cleanup());

test("shows mutation outcomes with actor and target context", () => {
  render(<AuditLogSection />);

  expect(screen.getByText("Mutation audit log")).toBeTruthy();
  expect(screen.getByText("Succeeded")).toBeTruthy();
  expect(screen.getByText("127.0.0.1:54321")).toBeTruthy();
  expect(screen.getByText("public.daily_revenue")).toBeTruthy();
  expect(screen.getByText("prod / app")).toBeTruthy();
  expect(screen.getByText("refreshed concurrently")).toBeTruthy();
});
