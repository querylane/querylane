import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { afterEach, describe, expect, test } from "@rstest/core";
import { cleanup, render, screen, within } from "@testing-library/react";
import { Pg19LockStatisticsCard } from "@/components/console-pages/pg19-lock-statistics-card";
import {
  LockStatisticsSchema,
  LockTypeStatisticsSchema,
} from "@/protogen/querylane/console/v1alpha1/instance_pb";
import { ObservationAvailability } from "@/protogen/querylane/console/v1alpha1/observation_pb";

afterEach(cleanup);

describe("pG19 lock statistics", () => {
  test("renders exact bigint totals, milliseconds and reset without a contention alert", () => {
    const reset = new Date("2026-11-10T12:00:00Z");
    render(
      <Pg19LockStatisticsCard
        statistics={create(LockStatisticsSchema, {
          availability: ObservationAvailability.AVAILABLE,
          byType: [
            create(LockTypeStatisticsSchema, {
              fastpathExceeded: 0n,
              lockType: "relation",
              statsResetAt: timestampFromDate(reset),
              waits: 9007199254740993n,
              waitTimeMs: 12.5,
            }),
          ],
        })}
      />
    );
    const table = screen.getByRole("table", {
      name: "Cumulative lock statistics by type",
    });
    expect(
      within(table).getByText(9007199254740993n.toLocaleString())
    ).toBeTruthy();
    expect(within(table).getByText("13 ms")).toBeTruthy();
    expect(within(table).getByText(reset.toLocaleString())).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(
      screen.getByText(
        "Instance-wide counters since each statistics reset, not current blockers. Waits count successful lock acquisitions after waiting longer than deadlock_timeout."
      )
    ).toBeTruthy();
  });

  test("preserves real zero counters and unknown resets", () => {
    render(
      <Pg19LockStatisticsCard
        statistics={create(LockStatisticsSchema, {
          availability: ObservationAvailability.AVAILABLE,
          byType: [
            create(LockTypeStatisticsSchema, { lockType: "transactionid" }),
          ],
        })}
      />
    );
    const table = screen.getByRole("table");
    expect(within(table).getAllByText("0")).toHaveLength(2);
    expect(within(table).getByText("0.0 ms")).toBeTruthy();
    expect(within(table).getByText("Unknown")).toBeTruthy();
  });

  test("does not show stale counts when a refresh is restricted or unavailable", () => {
    const statistics = create(LockStatisticsSchema, {
      availability: ObservationAvailability.AVAILABLE,
      byType: [
        create(LockTypeStatisticsSchema, { lockType: "relation", waits: 12n }),
      ],
    });
    const view = render(<Pg19LockStatisticsCard statistics={statistics} />);
    expect(screen.getByRole("table")).toBeTruthy();
    for (const [availability, label] of [
      [ObservationAvailability.RESTRICTED, "Restricted"],
      [ObservationAvailability.UNAVAILABLE, "Unavailable"],
      [ObservationAvailability.UNSPECIFIED, "Not reported"],
      [ObservationAvailability.NOT_APPLICABLE, "Not applicable"],
    ] as const) {
      view.rerender(
        <Pg19LockStatisticsCard
          statistics={create(LockStatisticsSchema, {
            ...statistics,
            availability,
          })}
        />
      );
      expect(screen.getByText(label)).toBeTruthy();
      expect(screen.queryByRole("table")).toBeNull();
      expect(screen.queryByText("relation")).toBeNull();
    }
  });

  test("omits the PG19-only card on old servers and old backend payloads", () => {
    const view = render(<Pg19LockStatisticsCard statistics={undefined} />);
    expect(view.container.textContent).toBe("");
    view.rerender(
      <Pg19LockStatisticsCard
        statistics={create(LockStatisticsSchema, {
          availability: ObservationAvailability.UNSUPPORTED,
        })}
      />
    );
    expect(view.container.textContent).toBe("");
  });
});
