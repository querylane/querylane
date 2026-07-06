"use client";

import React, {
  type ReactNode,
  use,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import type { ResolvedTheme, Theme } from "@/theme-types";
import { isTheme } from "@/theme-types";

interface ThemeProviderState {
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
  theme: Theme;
}

interface ThemeProviderProps {
  children: ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
}

const ThemeProviderContext = React.createContext<
  ThemeProviderState | undefined
>(undefined);

function subscribeToSystemTheme(onStoreChange: () => void) {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return () => undefined;
  }
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  mediaQuery.addEventListener("change", onStoreChange);
  return () => mediaQuery.removeEventListener("change", onStoreChange);
}

function getSystemTheme(): ResolvedTheme {
  if (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  ) {
    return "dark";
  }
  return "light";
}

function getThemeStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function getInitialTheme(storageKey: string, defaultTheme: Theme): Theme {
  const storedTheme = getThemeStorage()?.getItem(storageKey) ?? null;
  return isTheme(storedTheme) ? storedTheme : defaultTheme;
}

function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "querylane-ui-theme",
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(() =>
    getInitialTheme(storageKey, defaultTheme)
  );
  const systemTheme = useSyncExternalStore(
    subscribeToSystemTheme,
    getSystemTheme,
    (): ResolvedTheme => "light"
  );

  const resolvedTheme: ResolvedTheme = theme === "system" ? systemTheme : theme;

  // allow-useEffect: sync theme with system/DOM
  useEffect(
    function applyThemeToDom() {
      const root = window.document.documentElement;

      root.classList.remove("light", "dark");
      root.classList.add(resolvedTheme);
      root.style.colorScheme = resolvedTheme;
    },
    [resolvedTheme]
  );

  const updateTheme = (newTheme: Theme) => {
    getThemeStorage()?.setItem(storageKey, newTheme);
    setTheme(newTheme);
  };

  const value: ThemeProviderState = {
    resolvedTheme,
    setTheme: updateTheme,
    theme,
  };

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

function useTheme() {
  const context = use(ThemeProviderContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}

export type { ResolvedTheme, Theme } from "@/theme-types";
export { ThemeProvider, useTheme };
