"use client";

import { createContext, use } from "react";

interface SidebarContextProps {
  hoverRevealOpen: boolean;
  isMobile: boolean;
  open: boolean;
  openMobile: boolean;
  setHoverRevealOpen: (open: boolean) => void;
  setOpen: (open: boolean) => void;
  setOpenMobile: (open: boolean) => void;
  state: "expanded" | "collapsed";
  toggleSidebar: () => void;
}

const SidebarContext = createContext<SidebarContextProps | null>(null);

function useSidebar() {
  const context = use(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.");
  }

  return context;
}

export type { SidebarContextProps };
export { SidebarContext, useSidebar };
