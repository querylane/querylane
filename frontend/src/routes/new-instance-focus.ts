import { waitForNextFrame } from "@/lib/wait-for-next-frame";

export function focusFirstCreateInstanceInvalidField() {
  waitForNextFrame().then(() => {
    for (const input of document.querySelectorAll<HTMLElement>("input")) {
      if (input.ariaInvalid === "true") {
        input.focus();
        return;
      }
    }
  });
}
