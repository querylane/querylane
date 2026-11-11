import { create } from "@bufbuild/protobuf";
import { expect, test } from "@rstest/core";
import { render, screen } from "@testing-library/react";
import { AutovacuumPrioritiesCard } from "@/components/console-pages/autovacuum-priorities-card";
import { AutovacuumPrioritiesSchema } from "@/protogen/querylane/console/v1alpha1/database_pb";
import { ObservationAvailability } from "@/protogen/querylane/console/v1alpha1/observation_pb";

test("renders measured scores and actual eligibility", () => {
  render(
    <AutovacuumPrioritiesCard
      priorities={create(AutovacuumPrioritiesSchema, {
        availability: ObservationAvailability.AVAILABLE,
        tables: [{ schemaName: "sales", tableName: "orders", score: 250 }],
      })}
    />
  );
  expect(screen.getByText("sales.orders")).not.toBeNull();
  expect(screen.getByText("250")).not.toBeNull();
  expect(screen.getByText("Not currently eligible")).not.toBeNull();
});

test("renders restricted data as unavailable, not an empty healthy sample", () => {
  render(
    <AutovacuumPrioritiesCard
      priorities={create(AutovacuumPrioritiesSchema, {
        availability: ObservationAvailability.RESTRICTED,
        summary: "The connected role cannot read autovacuum priorities",
      })}
    />
  );
  expect(
    screen.getByText("The connected role cannot read autovacuum priorities")
  ).not.toBeNull();
  expect(screen.queryByRole("table")).toBeNull();
  expect(
    screen.queryByText("No visible vacuumable tables in this database.")
  ).toBeNull();
});
