import { create as createProto } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { AuditLogSection } from "@/components/admin-ops/audit-log-section";
import {
  AuditLogEntry_Status,
  AuditLogEntrySchema,
  ListAuditLogEntriesResponseSchema,
} from "@/protogen/querylane/console/v1alpha1/admin_pb";

const state = vi.hoisted(() => ({
  fetchNextPage: vi.fn(async () => undefined),
}));

vi.mock("@/hooks/api/admin", () => ({
  useAuditLogEntriesInfiniteQuery: () => ({
    data: {
      pages: [
        createProto(ListAuditLogEntriesResponseSchema, {
          auditLogEntries: [
            createProto(AuditLogEntrySchema, {
              action: "refresh_materialized_view",
              actor: "127.0.0.1:54321",
              database: "app",
              finishedAt: timestampFromDate(new Date("2026-08-12T12:00:01Z")),
              instance: "instances/prod",
              resultSummary: "refreshed concurrently",
              startedAt: timestampFromDate(new Date("2026-08-12T12:00:00Z")),
              status: AuditLogEntry_Status.SUCCEEDED,
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
    refetch: vi.fn(),
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
