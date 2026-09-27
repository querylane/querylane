import { page } from "@rstest/browser";
import { render } from "@rstest/browser-react";
import { expect, test } from "@rstest/core";
import { ScreenshotFrame } from "@/__tests__/browser-test-utils";

const expectedTheme =
  import.meta.env.PUBLIC_TEST_BROWSER_THEME === "dark" ? "dark" : "light";

test("browser test setup applies the configured theme and reduced motion", () => {
  const root = document.documentElement;
  const otherTheme = expectedTheme === "dark" ? "light" : "dark";

  expect(root.classList.contains(expectedTheme)).toBe(true);
  expect(root.classList.contains(otherTheme)).toBe(false);
  expect(root.dataset["visualTheme"]).toBe(expectedTheme);
  expect(root.dataset["testMotion"]).toBe("reduced");
  expect(root.style.colorScheme).toBe(expectedTheme);
  expect(
    window.matchMedia(`(prefers-color-scheme: ${expectedTheme})`).matches
  ).toBe(true);
  expect(window.matchMedia("(prefers-reduced-motion: reduce)").matches).toBe(
    true
  );
});

test("browser test environment loads app styles and deterministic visual-test CSS", async () => {
  await render(
    <ScreenshotFrame>
      <div className="rounded-xl bg-primary p-4 text-primary-foreground">
        Styled browser frame
      </div>
    </ScreenshotFrame>
  );

  const styledElement = page.getByText("Styled browser frame");
  await expect.element(styledElement).toBeVisible();
  await expect.element(styledElement).toHaveCSS("padding-top", "16px");
  await expect
    .element(styledElement)
    .not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect.element(styledElement).not.toHaveCSS("border-radius", "0px");

  const frame = page.getByTestId("screenshot-frame");
  await expect.element(frame).toHaveCSS("width", "1180px");
  await expect.element(frame).toHaveAttribute("data-visual-test-root", "");
});
