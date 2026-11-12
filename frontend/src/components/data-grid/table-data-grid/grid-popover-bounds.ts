// Preserve the previous grid-local gutter; SDK owns viewport padding.
const GRID_POPUP_PADDING = 5;

function bindGridPopoverBounds(element: HTMLDivElement, boundary: HTMLElement) {
  function updateBounds() {
    // Closed native popovers (and layout-less test DOMs) have no geometry.
    // Subtracting a previous translation there would feed our own observer.
    if (element.getClientRects().length === 0) {
      return;
    }
    const offsetX =
      Number.parseFloat(
        element.style.getPropertyValue("--grid-popup-offset-x")
      ) || 0;
    // The caller is the toolbar: constrain its inline width, not its 36px
    // height. UI SDK keeps vertical placement and viewport collisions.
    const bounds = boundary.getBoundingClientRect();
    const popup = element.getBoundingClientRect();
    const left = Math.max(bounds.left, 0) + GRID_POPUP_PADDING;
    const right =
      Math.min(bounds.right, globalThis.innerWidth) - GRID_POPUP_PADDING;
    const nextX =
      Math.max(left, Math.min(popup.left - offsetX, right - popup.width)) -
      (popup.left - offsetX);
    const properties = {
      "--grid-popup-max-width": `${Math.max(0, right - left)}px`,
      "--grid-popup-offset-x": `${nextX}px`,
    };
    placementObserver.disconnect();
    for (const [property, value] of Object.entries(properties)) {
      if (element.style.getPropertyValue(property) !== value) {
        element.style.setProperty(property, value);
      }
    }
    placementObserver.observe(element, {
      attributes: true,
      attributeFilter: ["style"],
    });
  }
  const observer = new ResizeObserver(updateBounds);
  const placementObserver = new MutationObserver(updateBounds);
  observer.observe(boundary);
  observer.observe(element);
  placementObserver.observe(element, {
    attributes: true,
    attributeFilter: ["style"],
  });
  globalThis.addEventListener("resize", updateBounds);
  globalThis.addEventListener("scroll", updateBounds, {
    capture: true,
    passive: true,
  });
  element.addEventListener("animationend", updateBounds);
  element.addEventListener("transitionend", updateBounds);
  updateBounds();
  return () => {
    element.removeEventListener("animationend", updateBounds);
    element.removeEventListener("transitionend", updateBounds);
    observer.disconnect();
    placementObserver.disconnect();
    globalThis.removeEventListener("resize", updateBounds);
    globalThis.removeEventListener("scroll", updateBounds, { capture: true });
  };
}

export { bindGridPopoverBounds };
