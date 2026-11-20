import { expect, test } from "@rstest/core";
import { render, screen } from "@testing-library/react";
import { ChartContainer } from "./chart-container";

test("retained chart data stays busy until refreshed samples settle", () => {
  const { container, rerender } = render(
    <ChartContainer isRefreshing={true} series={[]}>
      <p>Retained metric samples</p>
    </ChartContainer>
  );
  expect(
    container.querySelector('[data-slot="chart"]')?.getAttribute("aria-busy")
  ).toBe("true");
  expect(screen.getByText("Retained metric samples")).toBeTruthy();
  rerender(
    <ChartContainer isRefreshing={false} series={[]}>
      <p>Refreshed metric samples</p>
    </ChartContainer>
  );
  expect(
    container.querySelector('[data-slot="chart"]')?.getAttribute("aria-busy")
  ).toBe("false");
  expect(screen.getByText("Refreshed metric samples")).toBeTruthy();
});
