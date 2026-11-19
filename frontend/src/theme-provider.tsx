"use client";

import {
  type ReactNode,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { ThemeProviderContext, type ThemeProviderState } from "@/theme-context";
import type { ResolvedTheme, Theme } from "@/theme-types";
import { isTheme } from "@/theme-types";

interface ThemeProviderProps {
  children: ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
}

function subscribeToSystemTheme(onStoreChange: () => void) {
  if (
    globalThis.window === undefined ||
    typeof globalThis.window.matchMedia !== "function"
  ) {
    return () => undefined;
  }
  const mediaQuery = globalThis.window.matchMedia(
    "(prefers-color-scheme: dark)"
  );
  mediaQuery.addEventListener("change", onStoreChange);
  return () => {
    mediaQuery.removeEventListener("change", onStoreChange);
  };
}

function getSystemTheme() {
  if (
    globalThis.window !== undefined &&
    typeof globalThis.window.matchMedia === "function" &&
    globalThis.window.matchMedia("(prefers-color-scheme: dark)").matches
  ) {
    return "dark" as const;
  }
  return "light" as const;
}

function getThemeStorage() {
  if (globalThis.window === undefined) {
    return null;
  }

  try {
    return globalThis.window.localStorage ?? null;
  } catch {
    return null;
  }
}

function getInitialTheme(storageKey: string, defaultTheme: Theme) {
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
  const systemTheme = useSyncExternalStore<ResolvedTheme>(
    subscribeToSystemTheme,
    getSystemTheme,
    () => "light"
  );

  const resolvedTheme: ResolvedTheme = theme === "system" ? systemTheme : theme;

  useEffect(
    function applyThemeToDom() {
      const root = globalThis.window.document.documentElement;

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

export type { ResolvedTheme, Theme } from "@/theme-types";
export { ThemeProvider };
