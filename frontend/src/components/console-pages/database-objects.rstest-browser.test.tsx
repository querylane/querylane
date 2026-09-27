import { page } from "@rstest/browser";
import { render } from "@rstest/browser-react";
import { expect, test } from "@rstest/core";
import { ScreenshotFrame } from "@/__tests__/browser-test-utils";
import {
  DatabaseObjectsGridScenario,
  DatabaseObjectsLoadingScenario,
} from "@/visual-harness/database-objects-scenarios";

function cardColumnGaps() {
  const heading = Array.from(document.querySelectorAll("h1, h2, h3")).find(
    (element) => element.textContent === "Database objects"
  );
  const section = heading?.closest("section");
  if (!(section instanceof HTMLElement)) {
    throw new Error("Expected database objects section");
  }

  const cards = Array.from(
    section.querySelectorAll<HTMLElement>('[data-slot="card"]')
  ).map((card) => card.getBoundingClientRect());
  const columns = Map.groupBy(cards, (card) => Math.round(card.left));
  const gaps: number[] = [];

  for (const column of columns.values()) {
    const sortedCards = column.toSorted((left, right) => left.top - right.top);
    for (let index = 1; index < sortedCards.length; index += 1) {
      const previousCard = sortedCards[index - 1];
      const card = sortedCards[index];
      if (!(previousCard && card)) {
        throw new Error("Expected adjacent masonry cards");
      }
      gaps.push(card.top - previousCard.bottom);
    }
  }

  return gaps;
}

// Pixels for both states live in e2e/visual/console-resources.spec.ts.
test("database objects grid shows every category card at once", async () => {
  await render(
    <ScreenshotFrame>
      <DatabaseObjectsGridScenario />
    </ScreenshotFrame>
  );

  await expect
    .element(page.getByRole("heading", { name: "Database objects" }))
    .toBeVisible();
  await expect.element(page.getByText("Extensions")).toBeVisible();
  await expect.element(page.getByText("pgcrypto")).toBeVisible();
  await expect.element(page.getByText("Routines")).toBeVisible();
  await expect.element(page.getByText("route_eta")).toBeVisible();
  await expect.element(page.getByText("→ interval")).toBeVisible();
  await expect.element(page.getByText("plpgsql · stable")).toBeVisible();
  await expect.element(page.getByText("Types")).toBeVisible();
  await expect.element(page.getByText("shipment_status")).toBeVisible();
  await expect.element(page.getByText("weight_class")).toBeVisible();
  await expect.element(page.getByText("port_ref")).toBeVisible();
  await expect.element(page.getByText("Cron jobs")).toBeVisible();
  await expect.element(page.getByText("partman-maintenance")).toBeVisible();
  await expect.element(page.getByText("0 3 * * *")).toBeVisible();

  const gaps = cardColumnGaps();
  expect.soft(gaps.length).toBeGreaterThan(0);
  expect.soft(Math.max(...gaps)).toBeLessThanOrEqual(21);
});

test("database objects keeps its layout stable while loading", async () => {
  await render(
    <ScreenshotFrame>
      <DatabaseObjectsLoadingScenario />
    </ScreenshotFrame>
  );

  await expect
    .element(
      page.getByRole("status", { name: "Loading other database objects" })
    )
    .toBeVisible();
});
