"use client";

import { createColorScheme, createLocalStorage } from "@ui-sdk/core";
import { usePreference } from "@ui-sdk/react/preferences";
import { type ReactNode, useEffect, useState } from "react";
import { ThemeProviderContext, type ThemeProviderState } from "@/theme-context";
import type { ResolvedTheme, Theme } from "@/theme-types";

interface ThemeProviderProps {
  children: ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
}

function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "querylane-ui-theme",
  ...props
}: ThemeProviderProps) {
  const [colorScheme] = useState(() =>
    createColorScheme({
      defaultValue: defaultTheme,
      initial: "light",
      storage: createLocalStorage(storageKey),
    })
  );
  const preference = usePreference(colorScheme);
  const theme = preference.value;
  const resolvedTheme: ResolvedTheme =
    preference.resolved === "dark" ? "dark" : "light";

  // sync theme with system/DOM
  useEffect(
    function applyThemeToDom() {
      const root = globalThis.window.document.documentElement;

      root.classList.remove("light", "dark");
      root.classList.add(resolvedTheme);
      root.style.colorScheme = resolvedTheme;
    },
    [resolvedTheme]
  );

  const value: ThemeProviderState = {
    resolvedTheme,
    setTheme: (nextTheme) => {
      colorScheme.set(nextTheme);
    },
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
