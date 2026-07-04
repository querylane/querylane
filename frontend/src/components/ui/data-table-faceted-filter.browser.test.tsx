import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { ScreenshotFrame } from "@/__tests__/browser-test-utils";
import { DataTableFacetedFilter } from "@/components/ui/data-table-faceted-filter";

interface LinearRgb {
  blue: number;
  green: number;
  red: number;
}

const MINIMUM_NON_TEXT_CONTRAST_RATIO = 3;

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

test("selected filter checkbox checkmark remains visible while hovered", async () => {
  renderSelectedOwnerFilter();

  await page.getByRole("button", { exact: true, name: "Owner neondb_owner" }).click();
  const selectedOption = page.getByRole("option", {
    exact: true,
    name: "neondb_owner",
  });
  await selectedOption.hover();

  const optionElement = selectedOption.element();
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
