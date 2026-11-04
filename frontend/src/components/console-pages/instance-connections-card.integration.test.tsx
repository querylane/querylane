import { create } from "@bufbuild/protobuf";
import { afterEach, expect, rs, test } from "@rstest/core";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { InstanceConnectionsCard } from "@/components/console-pages/instance-connections-card";
import { ConnectionActivityHealthSchema } from "@/protogen/querylane/console/v1alpha1/instance_pb";

function FixtureLink({ children }: { children: ReactNode }) {
  return <a href="/activity">{children}</a>;
}
rs.mock("@tanstack/react-router", () => ({ Link: FixtureLink }));

afterEach(cleanup);
test("connection columns hide matching headers, values and totals", async () => {
  const user = userEvent.setup();
  render(
    <InstanceConnectionsCard
      activity={create(ConnectionActivityHealthSchema, {
        totalConnections: 7,
        activeConnections: 5,
        idleConnections: 2,
        maxConnections: 100,
        byApplication: [
          {
            applicationName: "api",
            activeConnections: 5,
            idleConnections: 2,
            totalConnections: 7,
          },
        ],
      })}
      instanceId="prod"
      isPending={false}
    />
  );
  await user.click(screen.getByRole("button", { name: "Columns" }));
  await user.click(screen.getByRole("menuitemcheckbox", { name: "Active" }));
  await user.keyboard("{Escape}");
  const table = screen.getByRole("table");
  expect(
    within(table).queryByRole("columnheader", { name: "Active" })
  ).toBeNull();
  expect(within(table).queryAllByRole("cell", { name: "5" })).toHaveLength(0);
  expect(within(table).getByRole("cell", { name: "api" })).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Columns" }));
  await user.click(screen.getByRole("menuitem", { name: "Reset columns" }));
  expect(
    within(table).getByRole("columnheader", { name: "Active" })
  ).toBeTruthy();
});
