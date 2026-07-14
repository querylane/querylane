import { cleanup, render, screen } from "@testing-library/react";
import { Table2 } from "lucide-react";
import { afterEach, describe, expect, test } from "vitest";
import { EmptyStatePanel } from "@/components/empty-state-panel";

afterEach(() => cleanup());

describe("EmptyStatePanel", () => {
  test("renders structured titles without forcing document heading order", () => {
    render(
      <EmptyStatePanel
        description="Try another schema."
        title="No tables found"
      />
    );

    expect(screen.getByText("No tables found")).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: "No tables found" })
    ).toBeNull();
  });

  test("separates structured descriptions from child content", () => {
    render(
      <EmptyStatePanel
        description="Try another schema."
        title="No tables found"
      >
        <span>Clear filters to show all tables.</span>
      </EmptyStatePanel>
    );

    expect(
      screen
        .getByText("Try another schema.")
        .closest('[data-slot="empty-description"]')
    ).toBeTruthy();
    expect(
      screen
        .getByText("Clear filters to show all tables.")
        .closest('[data-slot="empty-content"]')
    ).toBeTruthy();
  });

  test("renders an entity icon when supplied", () => {
    render(
      <EmptyStatePanel
        description="No rows matched."
        icon={Table2}
        title="No rows found"
      />
    );

    expect(screen.getByTestId("empty-state-icon")).toBeTruthy();
  });

  test("allows call sites to opt into semantic headings", () => {
    render(
      <EmptyStatePanel
        description="Try another schema."
        headingLevel="h3"
        title="No indexes"
      />
    );

    expect(
      screen.getByRole("heading", { level: 3, name: "No indexes" })
    ).toBeTruthy();
  });
});
