"use client";

import { createContext, useContext, useState } from "react";
import { createPortal } from "react-dom";

interface ExplorerSidebarSlotContextValue {
  setTarget: (element: HTMLElement | null) => void;
  target: HTMLElement | null;
}

const ExplorerSidebarSlotContext =
  createContext<ExplorerSidebarSlotContextValue | null>(null);

/**
 * Bridges the shared sidebar rail and the lazily loaded Data Explorer: the
 * rail registers a slot element while the explorer page portals its object
 * browser into it. This keeps the explorer data layer (controller, queries)
 * inside the lazy explorer chunk while the rail owns the layout.
 */
function ExplorerSidebarSlotProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  return (
    <ExplorerSidebarSlotContext.Provider value={{ setTarget, target }}>
      {children}
    </ExplorerSidebarSlotContext.Provider>
  );
}

/** Ref callback for the rail element that hosts the portaled explorer tree. */
function useExplorerSidebarSlotRegistration(): (
  element: HTMLElement | null
) => void {
  const context = useContext(ExplorerSidebarSlotContext);
  if (!context) {
    throw new Error(
      "useExplorerSidebarSlotRegistration requires ExplorerSidebarSlotProvider"
    );
  }
  return context.setTarget;
}

/**
 * Renders children into the registered rail slot. Renders nothing while no
 * slot is mounted (sidebar suspense fallback, closed mobile sheet, or tests
 * without a provider) — explorer state lives in the controller and URL, so
 * unmounting the tree here loses nothing.
 */
function ExplorerSidebarPortal({ children }: { children: React.ReactNode }) {
  const context = useContext(ExplorerSidebarSlotContext);
  if (!context?.target) {
    return null;
  }
  return createPortal(children, context.target);
}

export {
  ExplorerSidebarPortal,
  ExplorerSidebarSlotProvider,
  useExplorerSidebarSlotRegistration,
};
