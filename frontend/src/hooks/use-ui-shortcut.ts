import { type UseShortcutOptions, useShortcut } from "@ui-sdk/react/shortcuts";

function allowsBaseUiShortcut(layer: UseShortcutOptions["layer"]) {
  if (typeof document === "undefined") {
    return true;
  }
  const modal = [
    ...document.querySelectorAll<HTMLElement>(
      "[data-querylane-modal][data-open]"
    ),
  ].findLast(
    (candidate) => !candidate.closest('[inert], [aria-hidden="true"]')
  );
  if (!modal) {
    return true;
  }
  if (!layer) {
    return false;
  }
  let element: Element | null | undefined;
  if (typeof layer === "function") {
    element = layer();
  } else if ("current" in layer) {
    element = layer.current;
  } else {
    element = layer;
  }
  return element ? modal.contains(element) : false;
}

// SDK still owns key matching, IME/typing guards and registration lifetime.
// Base UI owns its modal stack; this predicate bridges that stack, without a second layer manager.
function useUiShortcut(
  keys: Parameters<typeof useShortcut>[0],
  handler: Parameters<typeof useShortcut>[1],
  options: UseShortcutOptions = {}
) {
  useShortcut(keys, handler, {
    ...options,
    when: () =>
      allowsBaseUiShortcut(options.layer) && (options.when?.() ?? true),
  });
}

export { useUiShortcut };
