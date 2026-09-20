import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import brandStyles from "./branding/querylane-logo.module.css";
import progressStyles from "./onboarding-wizard/phases/progress-phase.module.css";
import wizardStyles from "./onboarding-wizard/wizard-content.module.css";

test.each([
  {
    name: "brand cursor",
    className: brandStyles["chevron"],
    property: "fill",
    expected: "rgb(96, 165, 250)",
  },
  {
    name: "waiting glow",
    className: progressStyles["waitingIndicator"],
    property: "background-image",
    expected:
      "radial-gradient(circle, rgba(98, 122, 255, 0.14), rgba(7, 9, 15, 0) 65%)",
  },
  {
    name: "rail glow",
    className: wizardStyles["railGlow"],
    property: "background-image",
    expected:
      "radial-gradient(circle at 40% 30%, rgba(64, 102, 255, 0.18), transparent 40%), radial-gradient(circle at 60% 72%, rgba(129, 71, 255, 0.12), transparent 34%)",
  },
  {
    name: "backdrop",
    className: wizardStyles["backdrop"],
    property: "background-image",
    expected:
      "radial-gradient(circle at top, rgba(69, 98, 196, 0.12), transparent 32%), radial-gradient(circle at 50% 45%, rgba(63, 93, 194, 0.12), transparent 28%)",
  },
  {
    name: "dots",
    className: wizardStyles["dotPattern"],
    property: "background-image",
    expected: "radial-gradient(rgba(255, 255, 255, 0.08) 1px, transparent 1px)",
  },
  {
    name: "lines",
    className: wizardStyles["linePattern"],
    property: "background-image",
    expected:
      "linear-gradient(to right, rgba(255, 255, 255, 0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(255, 255, 255, 0.08) 1px, transparent 1px)",
  },
])(
  "$name preserves its original computed color",
  async ({ className, property, expected }) => {
    const { container } = await render(<div className={className} />);
    const actual = container.firstElementChild;
    if (!actual) {
      throw new Error("Missing color fixture");
    }
    const reference = document.createElement("div");
    reference.style.setProperty(property, expected);
    document.body.append(reference);
    try {
      expect(getComputedStyle(actual).getPropertyValue(property)).toBe(
        getComputedStyle(reference).getPropertyValue(property)
      );
    } finally {
      reference.remove();
    }
  }
);
