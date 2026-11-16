import { type ReactNode, useState } from "react";
import {
  BaseUiAnchorContext,
  BaseUiModalContext,
  BaseUiSafetyContext,
  type BaseUiSafetyProps,
  useBaseUiSafety,
} from "./base-ui-safety-context";

function BaseUiSafetyBoundary({
  markers,
  modal = false,
  children,
}: {
  markers: unknown;
  modal?: boolean;
  children: ReactNode;
}) {
  const inherited = useBaseUiSafety(markers);
  const [anchorSafety, setAnchorSafety] = useState<BaseUiSafetyProps>({});
  const safety = {
    "data-agent-hidden":
      inherited["data-agent-hidden"] ?? anchorSafety["data-agent-hidden"],
    "data-agent-secret":
      inherited["data-agent-secret"] ?? anchorSafety["data-agent-secret"],
    "data-agent-confirm":
      inherited["data-agent-confirm"] ?? anchorSafety["data-agent-confirm"],
  };
  function registerAnchor(element: HTMLElement | null) {
    if (element?.hasAttribute("aria-expanded") !== true) {
      return undefined;
    }
    function update() {
      const next = {
        "data-agent-hidden":
          Boolean(
            element?.parentElement?.closest(
              '[data-agent-hidden]:not([data-agent-hidden="false"])'
            )
          ) || undefined,
        "data-agent-secret":
          Boolean(
            element?.parentElement?.closest(
              '[data-agent-secret]:not([data-agent-secret="false"])'
            )
          ) || undefined,
        "data-agent-confirm":
          element?.parentElement
            ?.closest("[data-agent-confirm]")
            ?.getAttribute("data-agent-confirm") ?? undefined,
      };
      setAnchorSafety((current) =>
        JSON.stringify(current) === JSON.stringify(next) ? current : next
      );
    }
    update();
    const observer = new MutationObserver(update);
    for (
      let ancestor: HTMLElement | null = element;
      ancestor;
      ancestor = ancestor.parentElement
    ) {
      observer.observe(ancestor, {
        attributes: true,
        attributeFilter: [
          "data-agent-hidden",
          "data-agent-secret",
          "data-agent-confirm",
        ],
      });
    }
    return () => {
      observer.disconnect();
    };
  }
  return (
    <BaseUiAnchorContext value={registerAnchor}>
      <BaseUiModalContext value={modal}>
        <BaseUiSafetyContext value={safety}>{children}</BaseUiSafetyContext>
      </BaseUiModalContext>
    </BaseUiAnchorContext>
  );
}

export { BaseUiSafetyBoundary };
