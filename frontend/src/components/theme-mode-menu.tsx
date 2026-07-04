"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Theme, useTheme } from "@/theme-provider";

const THEME_OPTIONS: Array<{ label: string; value: Theme }> = [
  { label: "Light", value: "light" },
  { label: "Dark", value: "dark" },
  { label: "System", value: "system" },
];

function ThemeModeIcon({ theme }: { theme: Theme }) {
  if (theme === "light") {
    return <Sun className="size-4" />;
  }

  if (theme === "dark") {
    return <Moon className="size-4" />;
  }

  return <Monitor className="size-4" />;
}

export function ThemeModeMenu({
  resolvedTheme,
  setTheme,
  theme,
}: {
  resolvedTheme: ReturnType<typeof useTheme>["resolvedTheme"];
  setTheme: ReturnType<typeof useTheme>["setTheme"];
  theme: ReturnType<typeof useTheme>["theme"];
}) {
  const themeLabel = `Theme: ${theme} (resolved: ${resolvedTheme})`;

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={
                <Button
                  aria-label={themeLabel}
                  className="size-8"
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <ThemeModeIcon theme={theme} />
                  <span className="sr-only">Change theme</span>
                </Button>
              }
            />
          }
        />
        <TooltipContent>{themeLabel}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-36">
        {THEME_OPTIONS.map((option) => (
          <DropdownMenuItem
            aria-checked={theme === option.value}
            key={option.value}
            onClick={() => setTheme(option.value)}
            role="menuitemradio"
          >
            <ThemeModeIcon theme={option.value} />
            <span>{option.label}</span>
            {theme === option.value ? (
              <span className="ml-auto text-muted-foreground">✓</span>
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
