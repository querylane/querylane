import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SetupFlowExplainer } from "@/components/setup-flow-explainer";

const INTERNAL_STORAGE_DESCRIPTION_RE =
  /stores its own metadata, saved connection records/i;
const MANAGED_STORAGE_COMPLETE_RE =
  /metadata database was configured during setup/i;
const MANAGED_SERVER_DESCRIPTION_RE =
  /databases and schemas you want to administer/i;

afterEach(() => {
  cleanup();
});

describe("SetupFlowExplainer", () => {
  it("explains setup as internal storage before the managed Postgres server", () => {
    render(<SetupFlowExplainer tone="onboarding" variant="setup" />);

    const steps = screen.getAllByRole("group");
    expect(steps).toHaveLength(2);
    const [storageStep, managedStep] = steps as [HTMLElement, HTMLElement];

    expect(within(storageStep).getByText("Step 1")).toBeTruthy();
    expect(
      within(storageStep).getByText("QueryLane internal storage")
    ).toBeTruthy();
    expect(
      within(storageStep).getByText(INTERNAL_STORAGE_DESCRIPTION_RE)
    ).toBeTruthy();
    expect(within(managedStep).getByText("Step 2")).toBeTruthy();
    expect(
      within(managedStep).getByText("Postgres server to manage")
    ).toBeTruthy();
  });

  it("marks internal storage complete on the managed Postgres form", () => {
    render(<SetupFlowExplainer tone="surface" variant="managed" />);

    const steps = screen.getAllByRole("group");
    expect(steps).toHaveLength(2);
    const [storageStep, managedStep] = steps as [HTMLElement, HTMLElement];

    expect(within(storageStep).getByText("Step 1 complete")).toBeTruthy();
    expect(
      within(storageStep).getByText(MANAGED_STORAGE_COMPLETE_RE)
    ).toBeTruthy();
    expect(within(managedStep).getByText("Step 2")).toBeTruthy();
    expect(
      within(managedStep).getByText(MANAGED_SERVER_DESCRIPTION_RE)
    ).toBeTruthy();
  });
});
