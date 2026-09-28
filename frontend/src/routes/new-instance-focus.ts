/** Call after React commits the error render, for example from an effect. */
export function focusFirstCreateInstanceInvalidField() {
  for (const input of document.querySelectorAll<HTMLElement>("input")) {
    if (input.getAttribute("aria-invalid") === "true") {
      input.focus();
      return;
    }
  }
}
