import { expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { useState } from "react";
import { ScreenshotFrame } from "@/__tests__/browser-test-utils";
import { DataTableFacetedFilter } from "@/components/ui/data-table-faceted-filter";

interface LinearRgb {
  blue: number;
  green: number;
  red: number;
}

const MINIMUM_NON_TEXT_CONTRAST_RATIO = 3;
const MAXIMUM_INLINE_COUNT_GAP_PX = 12;

function clampChannel(channel: number) {
  return Math.min(1, Math.max(0, channel));
}

function convertGammaEncodedChannelToLinear(channel: number) {
  const normalized = channel / 255;
  if (normalized <= 0.04045) {
    return normalized / 12.92;
  }

  return ((normalized + 0.055) / 1.055) ** 2.4;
}

function parseRgbColor(color: string): LinearRgb | null {
  const match = color.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*[\d.]+)?\s*\)$/
  );
  if (!match) {
    return null;
  }

  const [, red, green, blue] = match;
  return {
    blue: convertGammaEncodedChannelToLinear(Number(blue)),
    green: convertGammaEncodedChannelToLinear(Number(green)),
    red: convertGammaEncodedChannelToLinear(Number(red)),
  };
}

function parseOklchColor(color: string): LinearRgb | null {
  const match = color.match(
    /^oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*[\d.]+%?)?\s*\)$/
  );
  if (!match) {
    return null;
  }

  const [, lightness, chroma, hue] = match;
  const l = lightness.endsWith("%")
    ? Number(lightness.slice(0, -1)) / 100
    : Number(lightness);
  const c = Number(chroma);
  const hueRadians = (Number(hue) * Math.PI) / 180;
  const a = c * Math.cos(hueRadians);
  const b = c * Math.sin(hueRadians);

  const long = l + 0.3963377774 * a + 0.2158037573 * b;
  const medium = l - 0.1055613458 * a - 0.0638541728 * b;
  const short = l - 0.0894841775 * a - 1.291485548 * b;

  const longCubed = long ** 3;
  const mediumCubed = medium ** 3;
  const shortCubed = short ** 3;

  return {
    blue: clampChannel(
      -0.0041960863 * longCubed -
        0.7034186147 * mediumCubed +
        1.707614701 * shortCubed
    ),
    green: clampChannel(
      -1.2684380046 * longCubed +
        2.6097574011 * mediumCubed -
        0.3413193965 * shortCubed
    ),
    red: clampChannel(
      4.0767416621 * longCubed -
        3.3077115913 * mediumCubed +
        0.2309699292 * shortCubed
    ),
  };
}

function parseCssColor(color: string): LinearRgb {
  const parsedColor = parseRgbColor(color) ?? parseOklchColor(color);
  if (!parsedColor) {
    throw new Error(`Unsupported CSS color format: ${color}`);
  }

  return parsedColor;
}

function relativeLuminance(color: LinearRgb) {
  return 0.2126 * color.red + 0.7152 * color.green + 0.0722 * color.blue;
}

function contrastRatio(first: string, second: string) {
  const firstLuminance = relativeLuminance(parseCssColor(first));
  const secondLuminance = relativeLuminance(parseCssColor(second));
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);

  return (lighter + 0.05) / (darker + 0.05);
}

function renderSelectedOwnerFilter() {
  render(
    <ScreenshotFrame>
      <DataTableFacetedFilter
        onSelectedValuesChange={() => undefined}
        options={[{ label: "neondb_owner", value: "neondb_owner" }]}
        selectedValues={["neondb_owner"]}
        title="Owner"
      />
    </ScreenshotFrame>
  );
}

function SingleSelectFilterFixture() {
  const [selectedValues, setSelectedValues] = useState(["login"]);
  return (
    <ScreenshotFrame>
      <DataTableFacetedFilter
        onSelectedValuesChange={setSelectedValues}
        options={[
          { count: 3, label: "User", value: "login" },
          { count: 1, label: "Superuser", value: "super" },
        ]}
        selectedValues={selectedValues}
        singleSelect
        title="Type"
      />
    </ScreenshotFrame>
  );
}

function FixedEnumFilterFixture() {
  const [selectedValues, setSelectedValues] = useState<string[]>([]);
  return (
    <ScreenshotFrame>
      <DataTableFacetedFilter
        onSelectedValuesChange={setSelectedValues}
        options={[
          { label: "Active", value: "active" },
          { label: "Paused", value: "paused" },
        ]}
        selectedValues={selectedValues}
        title="Status"
      />
    </ScreenshotFrame>
  );
}

function SelectedBadgeOrderFixture() {
  return (
    <ScreenshotFrame>
      <DataTableFacetedFilter
        onSelectedValuesChange={() => undefined}
        options={[
          { label: "Primary", value: "primary" },
          { label: "Replica", value: "replica" },
        ]}
        selectedValues={["replica", "primary"]}
        title="Mode"
      />
      <DataTableFacetedFilter
        onSelectedValuesChange={() => undefined}
        options={[]}
        selectedValues={["internal-stale-id"]}
        title="Status"
      />
    </ScreenshotFrame>
  );
}

test("selected filter checkbox checkmark remains visible while hovered", async () => {
  renderSelectedOwnerFilter();

  await page.getByRole("button", { exact: true, name: "Owner neondb_owner" }).click();
  const selectedOption = page.getByRole("option", {
    exact: true,
    name: "neondb_owner",
  });
  await selectedOption.hover();

  const optionElement = selectedOption.element();
  expect(optionElement.getAttribute("aria-checked")).toBeNull();
  const selectedDescription = document.getElementById(
    optionElement.getAttribute("aria-describedby") ?? ""
  );
  expect(selectedDescription?.textContent).toBe("Included in filter");
  expect(optionElement.dataset["selected"]).toBe("true");

  const checkbox = optionElement.querySelector(
    '[data-slot="faceted-filter-checkbox"]'
  );
  const checkmark = checkbox?.querySelector(
    '[data-slot="faceted-filter-checkbox-check"]'
  );
  if (!(checkbox && checkmark)) {
    throw new Error("Expected selected filter option to render a checkbox checkmark.");
  }

  const checkboxStyles = getComputedStyle(checkbox);
  const checkmarkStyles = getComputedStyle(checkmark);
  const optionStyles = getComputedStyle(optionElement);

  expect(
    contrastRatio(checkboxStyles.backgroundColor, checkmarkStyles.color)
  ).toBeGreaterThanOrEqual(MINIMUM_NON_TEXT_CONTRAST_RATIO);
  expect(
    contrastRatio(checkboxStyles.backgroundColor, optionStyles.color)
  ).toBeGreaterThanOrEqual(MINIMUM_NON_TEXT_CONTRAST_RATIO);
});

test("single-select filter replaces the previous option and shows counts", async () => {
  render(<SingleSelectFilterFixture />);

  await page.getByRole("button", { name: /Type.*User/ }).click();
  await expect.element(page.getByRole("option", { name: /Superuser\s+1/ }))
    .toBeVisible();

  await page.getByRole("option", { name: /Superuser\s+1/ }).click();

  await expect
    .element(page.getByRole("button", { name: /Type.*Superuser/ }))
    .toBeVisible();
  await expect.element(page.getByRole("button", { name: /Type.*User/ }))
    .not.toBeInTheDocument();
});

test("filter option counts stay beside their labels", async () => {
  render(<SingleSelectFilterFixture />);

  await page.getByRole("button", { name: /Type.*User/ }).click();
  const option = page.getByRole("option", { name: /Superuser\s+1/ });
  await expect.element(option).toBeVisible();

  const [label, count] = option.element().querySelectorAll(":scope > span");
  if (!(label && count)) {
    throw new Error("Expected the filter option to render a label and count.");
  }

  const gap =
    count.getBoundingClientRect().left - label.getBoundingClientRect().right;
  expect(gap).toBeLessThanOrEqual(MAXIMUM_INLINE_COUNT_GAP_PX);
});

test("fixed enum filters omit search without changing option behavior", async () => {
  render(<FixedEnumFilterFixture />);

  await page.getByRole("button", { name: "Status" }).click();

  await expect.element(page.getByRole("option", { name: "Active" })).toBeVisible();
  await expect.element(page.getByRole("option", { name: "Paused" })).toBeVisible();
  const activeOption = page.getByRole("option", { name: "Active" }).element();
  const activeDescription = document.getElementById(
    activeOption.getAttribute("aria-describedby") ?? ""
  );
  expect(activeDescription?.textContent).toBe("Not included in filter");
  await expect.element(page.getByRole("combobox")).not.toBeInTheDocument();

  await page.getByRole("option", { name: "Active" }).click();
  await expect
    .element(page.getByRole("button", { name: /Status.*Active/ }))
    .toBeVisible();
});

test("fixed enum filters support keyboard selection and restore trigger focus", async () => {
  render(<FixedEnumFilterFixture />);

  const trigger = page.getByRole("button", { name: "Status" });
  await expect.element(trigger).toBeVisible();
  const triggerElement = trigger.element();
  triggerElement.focus();
  await userEvent.keyboard("{Enter}");
  await expect.element(page.getByRole("option", { name: "Active" })).toBeVisible();
  const listbox = page.getByRole("listbox", { name: "Status options" });
  await expect.element(listbox).toBeVisible();
  const listboxElement = listbox.element();
  expect(document.activeElement).toBe(listboxElement);
  const initialActiveDescendant = listboxElement.getAttribute(
    "aria-activedescendant"
  );

  await userEvent.keyboard("{ArrowDown}");
  await expect
    .poll(() => listboxElement.getAttribute("aria-activedescendant"))
    .not.toBe(initialActiveDescendant);
  const nextActiveDescendant = listboxElement.getAttribute(
    "aria-activedescendant"
  );
  expect(document.getElementById(nextActiveDescendant ?? "")?.textContent)
    .toContain("Paused");
  await userEvent.keyboard("{Enter}");

  await expect
    .element(page.getByRole("button", { name: /Status.*Paused/ }))
    .toBeVisible();
  await userEvent.keyboard("{Escape}");
  await expect.poll(() => document.activeElement).toBe(triggerElement);
});

test("selected badges follow option order and hide stale values", async () => {
  render(<SelectedBadgeOrderFixture />);

  await expect
    .element(page.getByRole("button", { name: "Mode Primary Replica" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Status Unavailable" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: /internal-stale-id/ }))
    .not.toBeInTheDocument();
});
