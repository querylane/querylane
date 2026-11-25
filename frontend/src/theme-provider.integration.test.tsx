import { afterEach, beforeEach, expect, rs, test } from "@rstest/core";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/theme-context";
import { ThemeProvider } from "@/theme-provider";

const STORAGE_KEY = "querylane-ui-theme";
// The SDK intentionally shares one media query per globalThis.window.
const media = Object.assign(new EventTarget(), {
  addListener: rs.fn(),
  matches: false,
  media: "(prefers-color-scheme: dark)",
  onchange: null,
  removeListener: rs.fn(),
}) satisfies MediaQueryList;

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
  media.matches = false;
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
    const storageChange = {
      key: STORAGE_KEY,
      newValue: "light",
      storageArea: localStorage,
    } satisfies StorageEventInit;
    globalThis.window.dispatchEvent(
      Object.assign(new Event("storage"), storageChange)
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
    media.matches = true;
    const mediaChange = { matches: media.matches, media: media.media };
    media.dispatchEvent(Object.assign(new Event("change"), mediaChange));
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
