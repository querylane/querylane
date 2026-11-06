"use client";

import { createContext, use } from "react";

interface ExplorerSidebarSlotContextValue {
  setTarget: (element: HTMLElement | null) => void;
  target: HTMLElement | null;
}

const ExplorerSidebarSlotContext =
  createContext<ExplorerSidebarSlotContextValue | null>(null);

function useExplorerSidebarSlotRegistration(): (
  element: HTMLElement | null
) => void {
  const context = use(ExplorerSidebarSlotContext);
  if (!context) {
    throw new Error(
      "useExplorerSidebarSlotRegistration requires ExplorerSidebarSlotProvider"
    );
  }
  return context.setTarget;
}

export { ExplorerSidebarSlotContext, useExplorerSidebarSlotRegistration };
