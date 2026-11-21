import { withSource } from "@ui-sdk/core/observe";
import { isUnknownArray } from "@/lib/value-guards";

const HIDDEN = '[data-agent-hidden]:not([data-agent-hidden="false"])';
const SECRET = '[data-agent-secret]:not([data-agent-secret="false"])';

function publicText(element: HTMLElement) {
  const walker = element.ownerDocument.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT
  );
  const text: string[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (
      !node.parentElement?.closest(`${HIDDEN},${SECRET},[aria-hidden="true"]`)
    ) {
      text.push(node.textContent ?? "");
    }
  }
  return text.join("").trim();
}

function baseUiChoices(element: HTMLElement) {
  const id = element.getAttribute("aria-controls");
  const popup =
    id !== null && id.length > 0
      ? element.ownerDocument.querySelector<HTMLElement>(`#${CSS.escape(id)}`)
      : null;
  return [
    ...(popup?.querySelectorAll<HTMLElement>('[role="option"], [role="tab"]') ??
      []),
  ].flatMap((item) =>
    item.closest(`${HIDDEN},${SECRET}`)
      ? []
      : [
          {
            element: item,
            value: choiceKey(encodedValue(item)),
            rawValue: encodedValue(item),
            label:
              item.getAttribute("data-querylane-label") ?? publicText(item),
            disabled:
              item.getAttribute("aria-disabled") === "true" ||
              item.matches(":disabled"),
          },
        ]
  );
}

function choiceKey(value: unknown) {
  return typeof value === "string" ? value : (JSON.stringify(value) ?? "");
}

function encodedValue(element: HTMLElement): unknown {
  const encoded = element.getAttribute("data-querylane-agent-value");
  if (encoded === null) {
    return undefined;
  }
  try {
    const value: unknown = JSON.parse(encoded);
    return value;
  } catch {
    return null;
  }
}

function isSecret(element: HTMLElement) {
  return (
    Boolean(element.closest(SECRET)) ||
    (element instanceof HTMLInputElement && element.type === "password")
  );
}

function publicValue(element: HTMLElement): unknown {
  if (element.closest(HIDDEN)) {
    return undefined;
  }
  if (isSecret(element)) {
    return "[redacted]";
  }
  let value: unknown = encodedValue(element);
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement
  ) {
    ({ value } = element);
  }
  return value;
}

function checkedState(element: HTMLElement): boolean | "mixed" {
  const checked = element.getAttribute("aria-checked");
  return checked === "mixed" ? "mixed" : checked === "true";
}

function baseUiState(element: HTMLElement) {
  return {
    value: publicValue(element),
    checked: checkedState(element),
    open:
      element.getAttribute("aria-expanded") === "true" ||
      element.hasAttribute("data-open"),
    disabled:
      element.matches(":disabled") ||
      element.getAttribute("aria-disabled") === "true" ||
      element.getAttribute("aria-readonly") === "true" ||
      element.getAttribute("data-querylane-agent-readonly") === "true" ||
      ((element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement) &&
        element.readOnly),
    required:
      element.hasAttribute("required") ||
      element.getAttribute("aria-required") === "true",
    available: !element.closest(HIDDEN),
  };
}

function requireBaseUiTarget(element: HTMLElement | undefined) {
  if (element?.isConnected !== true) {
    throw new Error("This Base UI control is no longer mounted.");
  }
  const state = baseUiState(element);
  if (!state.available || state.disabled) {
    throw new Error("This Base UI control is unavailable or read-only.");
  }
  return element;
}

function nextUiFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      resolve();
    });
  });
}

function setBaseUiOpen(element: HTMLElement, open: unknown) {
  requireBaseUiTarget(element);
  if (typeof open !== "boolean") {
    throw new TypeError("Open must be true or false.");
  }
  if (baseUiState(element).open !== open) {
    if (element.hasAttribute("aria-expanded")) {
      element.click();
    } else if (open) {
      throw new Error("This control has no closed trigger to open.");
    } else {
      element.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
    }
  }
}

function validateNativeValue(
  element: HTMLInputElement | HTMLTextAreaElement,
  requested: string
) {
  if (element instanceof HTMLInputElement) {
    const probe = element.ownerDocument.createElement("input");
    for (const name of ["type", "min", "max", "step"]) {
      const attribute = element.getAttribute(name);
      if (attribute !== null) {
        probe.setAttribute(name, attribute);
      }
    }
    probe.value = requested;
    if (probe.value !== requested) {
      throw new TypeError(
        "The requested value is invalid for this input type."
      );
    }
  }
}

async function setNativeBaseUiValue(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: unknown
) {
  if (typeof value !== "string" && typeof value !== "number") {
    throw new TypeError("Input value must be text or a number.");
  }
  const requested = String(value);
  validateNativeValue(element, requested);
  const prototype =
    element instanceof HTMLInputElement
      ? HTMLInputElement.prototype
      : HTMLTextAreaElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
  if (!descriptor?.set) {
    throw new Error("The native value setter is unavailable.");
  }
  descriptor.set.call(element, requested);
  const accepted = element.dispatchEvent(
    new Event("input", { bubbles: true, cancelable: true })
  );
  if (!accepted) {
    throw new Error("The app refused the requested value.");
  }
  await nextUiFrame();
  if (
    !element.isConnected ||
    (!isSecret(element) && element.value !== requested)
  ) {
    throw new Error("The app refused the requested value.");
  }
}

async function setBaseUiChecked(element: HTMLElement, checked: unknown) {
  if (typeof checked !== "boolean") {
    throw new TypeError("Checked must be true or false.");
  }
  const current = baseUiState(element).checked;
  if (current === "mixed" && !checked) {
    throw new Error(
      "Clear a mixed checkbox manually; the native toggle would select it instead."
    );
  }
  if (current !== checked) {
    element.click();
  }
  await nextUiFrame();
  if (baseUiState(element).checked !== checked) {
    throw new Error("The app refused the checked state.");
  }
}

function selectedTargets(element: HTMLElement, value: unknown) {
  const requested = isUnknownArray(value) ? value : [value];
  const choices = baseUiChoices(element);
  return requested.map((requestedValue) => {
    const matches = choices.filter(
      (candidate) =>
        candidate.value === choiceKey(requestedValue) ||
        candidate.label === requestedValue
    );
    const choice = matches.length === 1 ? matches[0] : undefined;
    if (
      !choice ||
      choice.disabled ||
      choice.element.closest("[data-agent-confirm]")
    ) {
      throw new Error(
        "Choose one enabled, unambiguous item from this control."
      );
    }
    return choice;
  });
}

function selectionChanges(element: HTMLElement, value: unknown) {
  const targets = selectedTargets(element, value);
  const multiple =
    element.getAttribute("data-querylane-agent-multiple") === "true";
  if (!multiple && targets.length !== 1) {
    throw new TypeError("Choose exactly one item for this control.");
  }
  if (!multiple) {
    return targets.filter(
      (choice) => choice.element.getAttribute("aria-selected") !== "true"
    );
  }
  const keys = new Set(targets.map((choice) => choice.value));
  const changes = baseUiChoices(element).filter((choice) => {
    const selected = choice.element.getAttribute("aria-selected") === "true";
    return selected !== keys.has(choice.value);
  });
  if (
    changes.some(
      (choice) =>
        choice.disabled ||
        choice.element.closest("[data-agent-confirm]") !== null
    )
  ) {
    throw new Error("A selected item cannot be changed by the agent.");
  }
  return changes;
}

function selectionMatches(element: HTMLElement, expected: string[]) {
  const actual = baseUiState(element).value;
  if (!isUnknownArray(actual)) {
    return expected.includes(choiceKey(actual));
  }
  const keys = new Set(expected);
  return (
    actual.length === keys.size &&
    actual.every((item) => keys.has(choiceKey(item)))
  );
}

async function setBaseUiValue(
  element: HTMLElement,
  value: unknown,
  guard: () => void
) {
  requireBaseUiTarget(element);
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement
  ) {
    await setNativeBaseUiValue(element, value);
    return;
  }
  setBaseUiOpen(element, true);
  await nextUiFrame();
  guard();
  // Resolve the entire change set before mutating; never toggle already selected items.
  const expected = selectedTargets(element, value).map(
    (choice) => choice.value
  );
  const changes = selectionChanges(element, value);
  await changes.reduce(
    (pending, choice) =>
      pending.then(() => {
        guard();
        requireBaseUiTarget(choice.element);
        withSource("agent", () => {
          choice.element.click();
        });
        return nextUiFrame();
      }),
    Promise.resolve()
  );
  guard();
  if (!selectionMatches(element, expected)) {
    throw new Error("The app refused the requested selection.");
  }
}

export {
  baseUiChoices,
  baseUiState,
  nextUiFrame,
  requireBaseUiTarget,
  setBaseUiChecked,
  setBaseUiOpen,
  setBaseUiValue,
};
