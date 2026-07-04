import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { SqlNotices } from "@/components/sql/sql-notices";

describe("SqlNotices", () => {
  test("renders returned PostgreSQL notices for technical details", () => {
    render(
      <SqlNotices
        notices={[
          "WARNING 01000: querylane warning: execute",
          "NOTICE 00000: querylane notice: plan",
        ]}
      />
    );

    expect(screen.getByRole("alert")).not.toBeNull();
    expect(
      screen.getByRole("heading", { level: 2, name: "Database notices" })
    ).not.toBeNull();
    expect(
      screen.getByRole("list", { name: "Database notices" })
    ).not.toBeNull();
    expect(
      screen.getByText("WARNING 01000: querylane warning: execute")
    ).not.toBeNull();
    expect(
      screen.getByText("NOTICE 00000: querylane notice: plan")
    ).not.toBeNull();
  });

  test("renders nothing when no notices were returned", () => {
    const { container } = render(<SqlNotices notices={["", "   "]} />);

    expect(container.childElementCount).toBe(0);
  });

  test("renders duplicate notice text without collapsing entries", () => {
    render(
      <SqlNotices
        headingLevel={3}
        notices={["NOTICE 00000: repeat", "NOTICE 00000: repeat"]}
      />
    );

    expect(
      screen.getByRole("heading", { level: 3, name: "Database notices" })
    ).not.toBeNull();
    expect(screen.getAllByText("NOTICE 00000: repeat")).toHaveLength(2);
  });
});
