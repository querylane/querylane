import { afterEach, beforeEach, expect, rs, test } from "@rstest/core";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/theme-context";
import { ThemeProvider } from "@/theme-provider";

const STORAGE_KEY = "querylane-ui-theme";
// The SDK intentionally shares one media query per globalThis.window.
const media = globalThis.window.matchMedia("(prefers-color-scheme: dark)");
let dark = false;
Object.defineProperty(media, "matches", {
  configurable: true,
  get: () => dark,
});

function ThemeProbe() {
  const { resolvedTheme, setTheme, theme } = useTheme();
  return (
    <>
      <output aria-label="Theme">{theme}</output>
      <output aria-label="Resolved theme">{resolvedTheme}</output>
      <Button
        onClick={() => {
          setTheme("dark");
        }}
        type="button"
      >
        Dark
      </Button>
      <Button
        onClick={() => {
          setTheme("system");
        }}
        type="button"
      >
        System
      </Button>
    </>
  );
}

beforeEach(() => {
  dark = false;
  rs.spyOn(globalThis.window, "matchMedia").mockReturnValue(media);
  localStorage.clear();
  document.documentElement.classList.remove("light", "dark");
});

afterEach(() => {
  rs.restoreAllMocks();
});

function expectTheme(choice: string, resolved: string) {
  expect(screen.getByRole("status", { name: "Theme" }).textContent).toBe(
    choice
  );
  expect(
    screen.getByRole("status", { name: "Resolved theme" }).textContent
  ).toBe(resolved);
  expect(document.documentElement.classList.contains(resolved)).toBe(true);
  expect(document.documentElement.style.colorScheme).toBe(resolved);
}

test("restores the saved theme and follows changes from another tab", () => {
  localStorage.setItem(STORAGE_KEY, "dark");
  render(
    <ThemeProvider>
      <ThemeProbe />
    </ThemeProvider>
  );
  expectTheme("dark", "dark");

  act(() => {
    localStorage.setItem(STORAGE_KEY, "light");
    globalThis.window.dispatchEvent(
      new StorageEvent("storage", {
        key: STORAGE_KEY,
        newValue: "light",
        storageArea: localStorage,
      })
    );
  });
  expectTheme("light", "light");
  expect(document.documentElement.classList.contains("dark")).toBe(false);
});

test("keeps system mode selected while following the operating system", () => {
  render(
    <ThemeProvider>
      <ThemeProbe />
    </ThemeProvider>
  );
  expectTheme("system", "light");
  act(() => {
    dark = true;
    media.dispatchEvent(new Event("change"));
  });
  expectTheme("system", "dark");
  fireEvent.click(screen.getByRole("button", { name: "Dark" }));
  expect(localStorage.getItem(STORAGE_KEY)).toBe("dark");
  fireEvent.click(screen.getByRole("button", { name: "System" }));
  expect(localStorage.getItem(STORAGE_KEY)).toBe("system");
  expectTheme("system", "dark");
});

test("unavailable storage does not prevent changing the theme", () => {
  render(
    <ThemeProvider>
      <ThemeProbe />
    </ThemeProvider>
  );
  const storage = localStorage;
  rs.spyOn(globalThis.window, "localStorage", "get").mockImplementation(() => {
    throw new DOMException("Storage is blocked", "SecurityError");
  });
  fireEvent.click(screen.getByRole("button", { name: "Dark" }));
  expectTheme("dark", "dark");
  expect(storage.getItem(STORAGE_KEY)).toBeNull();
});

test("ignores invalid saved preferences and preserves a custom storage key", () => {
  localStorage.setItem("custom-theme", "invalid");
  render(
    <ThemeProvider defaultTheme="light" storageKey="custom-theme">
      <ThemeProbe />
    </ThemeProvider>
  );
  expectTheme("light", "light");
  fireEvent.click(screen.getByRole("button", { name: "Dark" }));
  expect(localStorage.getItem("custom-theme")).toBe("dark");
  expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
});
