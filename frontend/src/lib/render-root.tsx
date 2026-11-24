import type { ReactNode } from "react";
import { createRoot, type RootOptions } from "react-dom/client";

export function renderRoot(
  element: Element,
  options: RootOptions,
  children: ReactNode
) {
  createRoot(element, options).render(children);
}
