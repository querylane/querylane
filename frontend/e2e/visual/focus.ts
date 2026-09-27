import { expect, type Locator } from "playwright/test";

/**
 * Asserts keyboard focus without depending on window focus. Playwright's
 * `toBeFocused()` reports "inactive" when a parallel CI worker holds window
 * focus, even though the element is the document's active element.
 */
export async function expectActiveElement(locator: Locator) {
  await expect
    .poll(() =>
      locator.evaluate(
        (element) => element === element.ownerDocument.activeElement
      )
    )
    .toBe(true);
}
