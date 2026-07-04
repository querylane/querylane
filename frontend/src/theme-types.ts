type Theme = "dark" | "light" | "system";
type ResolvedTheme = Exclude<Theme, "system">;

function isTheme(value: string | null): value is Theme {
  return value === "dark" || value === "light" || value === "system";
}

export type { ResolvedTheme, Theme };
export { isTheme };
