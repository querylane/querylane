import { getByRole } from "@testing-library/dom";
import { page } from "@rstest/browser";
import { render } from "@rstest/browser-react";
import { expect, test } from "@rstest/core";
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

async function renderSelectedOwnerFilter() {
  await render(
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

function SearchableFilterFixture() {
  const [selectedValues, setSelectedValues] = useState<string[]>([]);
  return (
    <ScreenshotFrame>
      <DataTableFacetedFilter
        onSelectedValuesChange={setSelectedValues}
        options={[
          { label: "Café", value: "cafe" },
          { label: "Analytics", value: "analytics" },
          { label: "Billing", value: "billing" },
          { label: "Events", value: "events" },
          { label: "Reports", value: "reports" },
          { label: "Search", value: "search" },
          { label: "Support", value: "support" },
        ]}
        searchPlaceholder="Search owners…"
        selectedValues={selectedValues}
        title="Owner"
      />
    </ScreenshotFrame>
  );
}

test("searchable facets announce checked state, match accents, and reset after closing", async () => {
  await render(<SearchableFilterFixture />);
  await page.getByRole("button", { name: "Owner", exact: true }).click();
  const search = page.getByRole("searchbox", { name: "Search owners…" });
  await expect.element(search).toBeVisible();
  await search.fill("cafe");
  const cafe = page.getByRole("menuitemcheckbox", {
    name: "Café",
    exact: true,
  });
  await expect.element(cafe).toBeVisible();
  await expect
    .element(page.getByRole("menuitemcheckbox", { name: "Billing" }))
    .not.toBeVisible();
  await search.press("Enter");
  await expect.element(cafe).toHaveAttribute("aria-checked", "true");
  await search.fill("missing owner");
  await expect.element(page.getByText("No options found.")).toBeVisible();
  await search.press("Escape");
  const trigger = page.getByRole("button", { name: "Owner Café", exact: true });
  await expect.element(trigger).toBeFocused();
  await trigger.click();
  await expect.element(search).toHaveValue("");
  await expect
    .element(page.getByRole("menuitemcheckbox", { name: "Billing" }))
    .toBeVisible();
  await page.getByRole("menuitem", { name: "Clear filter" }).click();
  await expect
    .element(page.getByRole("button", { name: "Owner", exact: true }))
    .toBeVisible();
});

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
  await renderSelectedOwnerFilter();

  await page
    .getByRole("button", { exact: true, name: "Owner neondb_owner" })
    .click();
  const selectedOption = page.getByRole("menuitemcheckbox", {
    exact: true,
    name: "neondb_owner",
  });
  await selectedOption.hover();

  const optionElement = getByRole(document.body, "menuitemcheckbox", {
    name: "neondb_owner",
  });
  expect(optionElement.getAttribute("aria-checked")).toBe("true");
  expect(optionElement.hasAttribute("data-highlighted")).toBe(true);

  const checkbox = optionElement.querySelector(
    '[data-slot="faceted-filter-checkbox"]'
  );
  const checkmark = checkbox?.querySelector(
    '[data-slot="faceted-filter-checkbox-check"]'
  );
  if (!(checkbox && checkmark)) {
    throw new Error(
      "Expected selected filter option to render a checkbox checkmark."
    );
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
  await render(<SingleSelectFilterFixture />);

  await page.getByRole("button", { name: /Type.*User/ }).click();
  await expect
    .element(page.getByRole("menuitemcheckbox", { name: /Superuser\s+1/ }))
    .toBeVisible();

  await page.getByRole("menuitemcheckbox", { name: /Superuser\s+1/ }).click();

  await expect
    .element(page.getByRole("button", { name: /Type.*Superuser/ }))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: /Type.*User/ }))
    .toBeDetached();
});

test("filter option counts stay beside their labels", async () => {
  await render(<SingleSelectFilterFixture />);

  await page.getByRole("button", { name: /Type.*User/ }).click();
  const option = page.getByRole("menuitemcheckbox", { name: /Superuser\s+1/ });
  await expect.element(option).toBeVisible();

  const optionElement = getByRole(document.body, "menuitemcheckbox", {
    name: /Superuser\s+1/,
  });
  const [label, count] = optionElement.querySelectorAll(":scope > span");
  if (!(label && count)) {
    throw new Error("Expected the filter option to render a label and count.");
  }

  const gap =
    count.getBoundingClientRect().left - label.getBoundingClientRect().right;
  expect(gap).toBeLessThanOrEqual(MAXIMUM_INLINE_COUNT_GAP_PX);
});

test("fixed enum filters omit search without changing option behavior", async () => {
  await render(<FixedEnumFilterFixture />);

  await page.getByRole("button", { name: "Status" }).click();

  await expect
    .element(page.getByRole("menuitemcheckbox", { name: "Active" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("menuitemcheckbox", { name: "Paused" }))
    .toBeVisible();
  const activeOption = getByRole(document.body, "menuitemcheckbox", {
    name: "Active",
  });
  expect(activeOption.getAttribute("aria-checked")).toBe("false");
  await expect.element(page.getByRole("combobox")).toBeDetached();

  await page.getByRole("menuitemcheckbox", { name: "Active" }).click();
  await expect
    .element(page.getByRole("button", { name: /Status.*Active/ }))
    .toBeVisible();
});

test("fixed enum filters support keyboard selection and restore trigger focus", async () => {
  await render(<FixedEnumFilterFixture />);

  const trigger = page.getByRole("button", { name: "Status" });
  await expect.element(trigger).toBeVisible();
  const triggerElement = getByRole(document.body, "button", { name: "Status" });
  await trigger.focus();
  await trigger.press("Enter");
  await expect
    .element(page.getByRole("menuitemcheckbox", { name: "Active" }))
    .toBeVisible();
  const active = page.getByRole("menuitemcheckbox", { name: "Active" });
  await expect.element(active).toBeFocused();
  await active.press("ArrowDown");
  const paused = page.getByRole("menuitemcheckbox", { name: "Paused" });
  await expect.element(paused).toBeFocused();
  await paused.press("Enter");
  await expect.element(paused).toHaveAttribute("aria-checked", "true");

  await expect
    .element(page.getByRole("button", { name: /Status.*Paused/ }))
    .toBeVisible();
  await paused.press("Escape");
  await expect.poll(() => document.activeElement).toBe(triggerElement);
});

test("selected badges follow option order and hide stale values", async () => {
  await render(<SelectedBadgeOrderFixture />);

  await expect
    .element(page.getByRole("button", { name: "Mode Primary Replica" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Status Unavailable" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: /internal-stale-id/ }))
    .toBeDetached();
});

test("a facet remains open when refreshed options make it searchable", async () => {
  const onSelectedValuesChange = () => undefined;
  const { rerender } = await render(
    <DataTableFacetedFilter
      onSelectedValuesChange={onSelectedValuesChange}
      options={[{ label: "Active", value: "active" }]}
      selectedValues={[]}
      title="Status"
    />
  );
  await page.getByRole("button", { name: "Status", exact: true }).click();
  await expect
    .element(page.getByRole("menuitemcheckbox", { name: "Active" }))
    .toBeVisible();
  await rerender(
    <DataTableFacetedFilter
      onSelectedValuesChange={onSelectedValuesChange}
      options={[
        { label: "Active", value: "active" },
        { label: "Paused", value: "paused" },
        { label: "Starting", value: "starting" },
        { label: "Stopped", value: "stopped" },
        { label: "Idle", value: "idle" },
        { label: "Pending", value: "pending" },
        { label: "Failed", value: "failed" },
      ]}
      selectedValues={[]}
      title="Status"
    />
  );
  const search = page.getByRole("searchbox", { name: "Search status…" });
  await expect.element(search).toBeVisible();
  await search.fill("pending");
  await expect
    .element(page.getByRole("menuitemcheckbox", { name: "Pending" }))
    .toBeVisible();
});

test("empty facets explain unavailable options and restore focus on Escape", async () => {
  await render(
    <DataTableFacetedFilter
      emptyText="No owners available."
      onSelectedValuesChange={() => undefined}
      options={[]}
      selectedValues={[]}
      title="Owner"
    />
  );
  const trigger = page.getByRole("button", { name: "Owner", exact: true });
  await trigger.click();
  await expect.element(page.getByText("No owners available.")).toBeVisible();
  await page.getByRole("menu", { name: "Owner options" }).press("Escape");
  await expect.element(trigger).toBeFocused();
});
