import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { ScreenshotFrame } from "@/__tests__/browser-test-utils";

test("browser test environment loads app styles and deterministic visual-test CSS", async () => {
  render(
    <ScreenshotFrame>
      <div className="rounded-xl bg-primary p-4 text-primary-foreground">
        {"Styled browser frame"}
      </div>
    </ScreenshotFrame>
  );

  const styledElement = page.getByText("Styled browser frame");
  await expect.element(styledElement).toBeVisible();

  const computed = window.getComputedStyle(styledElement.element());
  const styles = {
    backgroundColor: computed.backgroundColor,
    borderRadius: computed.borderRadius,
    paddingTop: computed.paddingTop,
  };

  expect(styles.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
  expect(styles.borderRadius).not.toBe("0px");
  expect(styles.paddingTop).toBe("16px");

  const frameWidth = window.getComputedStyle(
    page.getByTestId("screenshot-frame").element()
  ).width;
  expect(frameWidth).toBe("1180px");
  expect(page.getByTestId("screenshot-frame").element()).toHaveAttribute(
    "data-visual-test-root",
    ""
  );

  const { frameElement } = window;
  if (frameElement?.tagName !== "IFRAME") {
    throw new Error("Expected browser tests to run inside the Vitest iframe.");
  }
  const iframe = frameElement as HTMLIFrameElement;
  expect(iframe.style.transform).toBe("");
  expect(iframe.style.transformOrigin).toBe("");
});
