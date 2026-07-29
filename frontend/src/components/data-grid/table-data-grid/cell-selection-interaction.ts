const INTERACTIVE_CELL_TAG_NAMES = new Set([
  "A",
  "BUTTON",
  "INPUT",
  "SELECT",
  "TEXTAREA",
]);
const INTERACTIVE_CELL_ROLES = new Set(["button", "link"]);

function isCellSelectionInteractiveTarget(
  target: EventTarget | null,
  cell: HTMLElement
): boolean {
  if (!(target instanceof Element)) {
    return false;
  }
  let element: Element | null = target;
  while (element && cell.contains(element)) {
    if (INTERACTIVE_CELL_TAG_NAMES.has(element.tagName)) {
      return true;
    }
    if (element.getAttribute("contenteditable") === "true") {
      return true;
    }
    if (INTERACTIVE_CELL_ROLES.has(element.getAttribute("role") ?? "")) {
      return true;
    }
    element = element.parentElement;
  }
  return false;
}

export { isCellSelectionInteractiveTarget };
