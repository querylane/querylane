"use client";

import { createContext, use } from "react";
import type { ResolvedTheme, Theme } from "@/theme-types";

interface ThemeProviderState {
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
  theme: Theme;
}

const ThemeProviderContext = createContext<ThemeProviderState | undefined>(
  undefined
);

function useTheme() {
  const context = use(ThemeProviderContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}

export type { ThemeProviderState };
export { ThemeProviderContext, useTheme };
