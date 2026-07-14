import { Window } from "happy-dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Button } from "@/components/ui/button";
import {
  type ResolvedTheme,
  type Theme,
  ThemeProvider,
  useTheme,
} from "./theme-provider";
import { isTheme } from "./theme-types";

const STORAGE_KEY = "querylane-ui-theme";
const DOM_GLOBAL_KEYS = [
  "Event",
  "HTMLElement",
  "IS_REACT_ACT_ENVIRONMENT",
  "MouseEvent",
  "document",
  "localStorage",
  "window",
] as const;

type DomGlobalKey = (typeof DOM_GLOBAL_KEYS)[number];

interface MatchMediaController {
  setDarkMode: (matches: boolean) => void;
}

let root: Root | null = null;
let container: HTMLElement | null = null;
let matchMediaController: MatchMediaController | null = null;
let originalGlobalDescriptors = new Map<
  DomGlobalKey,
  PropertyDescriptor | undefined
>();

function setDomGlobal(key: DomGlobalKey, value: unknown) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value,
    writable: true,
  });
}

function captureDomGlobals() {
  originalGlobalDescriptors = new Map(
    DOM_GLOBAL_KEYS.map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ])
  );
}

function restoreDomGlobals() {
  for (const key of DOM_GLOBAL_KEYS) {
    const descriptor = originalGlobalDescriptors.get(key);
    if (descriptor) {
      Object.defineProperty(globalThis, key, descriptor);
      continue;
    }
    Reflect.deleteProperty(globalThis, key);
  }
  Reflect.deleteProperty(globalThis, "localStorage");
}

function installDom() {
  captureDomGlobals();
  const window = new Window({ url: "http://querylane.test" });
  window.SyntaxError = SyntaxError;

  setDomGlobal("Event", window.Event);
  setDomGlobal("HTMLElement", window.HTMLElement);
  setDomGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  setDomGlobal("MouseEvent", window.MouseEvent);
  setDomGlobal("document", window.document);
  setDomGlobal("localStorage", window.localStorage);
  setDomGlobal("window", window);

  const testContainer = document.createElement("div");
  document.body.append(testContainer);
  container = testContainer;
  matchMediaController = installMatchMedia(window);
}

function installMatchMedia(window: Window): MatchMediaController {
  let matches = false;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const media = "(prefers-color-scheme: dark)";
  const mediaQueryList = {
    addEventListener: (_type: "change", listener: EventListener) => {
      listeners.add(listener as (event: MediaQueryListEvent) => void);
    },
    get matches() {
      return matches;
    },
    media,
    onchange: null,
    removeEventListener: (_type: "change", listener: EventListener) => {
      listeners.delete(listener as (event: MediaQueryListEvent) => void);
    },
  } as MediaQueryList;

  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => mediaQueryList,
  });

  return {
    setDarkMode: (nextMatches: boolean) => {
      matches = nextMatches;
      const event = { matches, media } as MediaQueryListEvent;
      for (const listener of listeners) {
        listener(event);
      }
    },
  };
}

function ThemeProbe() {
  const { resolvedTheme, setTheme, theme } = useTheme();

  return (
    <div>
      <output data-testid="theme">{theme}</output>
      <output data-testid="resolved-theme">{resolvedTheme}</output>
      <Button onClick={() => setTheme("light")} type="button">
        {"Light"}
      </Button>
      <Button onClick={() => setTheme("dark")} type="button">
        {"Dark"}
      </Button>
      <Button onClick={() => setTheme("system")} type="button">
        {"System"}
      </Button>
    </div>
  );
}

async function renderThemeProvider(defaultTheme: Theme = "system") {
  if (!container) {
    throw new Error("Test DOM is not installed");
  }

  root = createRoot(container);

  await act(() => {
    root?.render(
      <ThemeProvider defaultTheme={defaultTheme}>
        <ThemeProbe />
      </ThemeProvider>
    );
  });
}

async function clickButton(label: string) {
  const button = Array.from(document.querySelectorAll("button")).find(
    (candidate) => candidate.textContent === label
  );

  if (!button) {
    throw new Error(`Button not found: ${label}`);
  }

  await act(() => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function text(testId: "resolved-theme" | "theme") {
  return document.querySelector(`[data-testid="${testId}"]`)?.textContent;
}

function readAppliedThemeState(theme: ResolvedTheme) {
  const inverseTheme = theme === "dark" ? "light" : "dark";

  return {
    colorScheme: document.documentElement.style.colorScheme,
    hasInverseTheme: document.documentElement.classList.contains(inverseTheme),
    hasTheme: document.documentElement.classList.contains(theme),
    resolvedTheme: text("resolved-theme"),
  };
}

beforeEach(() => {
  installDom();
});

afterEach(async () => {
  if (root) {
    await act(() => {
      root?.unmount();
    });
  }

  root = null;
  container = null;
  matchMediaController = null;
  restoreDomGlobals();
});

describe("theme provider", () => {
  it("accepts supported theme modes", () => {
    expect(isTheme("light")).toBe(true);
    expect(isTheme("dark")).toBe(true);
    expect(isTheme("system")).toBe(true);
  });

  it("rejects unsupported stored theme values", () => {
    expect(isTheme("auto")).toBe(false);
    expect(isTheme(null)).toBe(false);
  });

  it("hydrates from the persisted theme and applies it to the document", async () => {
    localStorage.setItem(STORAGE_KEY, "dark");

    await renderThemeProvider();

    expect(text("theme")).toBe("dark");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("dark");
    expect(readAppliedThemeState("dark")).toEqual({
      colorScheme: "dark",
      hasInverseTheme: false,
      hasTheme: true,
      resolvedTheme: "dark",
    });
  });

  it("persists selected light and dark modes", async () => {
    await renderThemeProvider();

    await clickButton("Dark");

    expect(text("theme")).toBe("dark");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("dark");
    expect(readAppliedThemeState("dark")).toEqual({
      colorScheme: "dark",
      hasInverseTheme: false,
      hasTheme: true,
      resolvedTheme: "dark",
    });

    await clickButton("Light");

    expect(text("theme")).toBe("light");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("light");
    expect(readAppliedThemeState("light")).toEqual({
      colorScheme: "light",
      hasInverseTheme: false,
      hasTheme: true,
      resolvedTheme: "light",
    });
  });

  it("keeps system mode selected while following OS color scheme changes", async () => {
    await renderThemeProvider();

    expect(text("theme")).toBe("system");
    expect(readAppliedThemeState("light")).toEqual({
      colorScheme: "light",
      hasInverseTheme: false,
      hasTheme: true,
      resolvedTheme: "light",
    });

    await act(() => {
      matchMediaController?.setDarkMode(true);
    });

    expect(text("theme")).toBe("system");
    expect(readAppliedThemeState("dark")).toEqual({
      colorScheme: "dark",
      hasInverseTheme: false,
      hasTheme: true,
      resolvedTheme: "dark",
    });

    await clickButton("System");

    expect(localStorage.getItem(STORAGE_KEY)).toBe("system");
    expect(readAppliedThemeState("dark")).toEqual({
      colorScheme: "dark",
      hasInverseTheme: false,
      hasTheme: true,
      resolvedTheme: "dark",
    });
  });
});

describe("theme provider edge cases", () => {
  it("throws when useTheme is used outside provider", () => {
    expect(() => renderToStaticMarkup(<ThemeProbe />)).toThrow(
      "useTheme must be used within a ThemeProvider"
    );
  });

  it("renders with default theme without browser globals", () => {
    restoreDomGlobals();

    try {
      expect(
        renderToStaticMarkup(
          <ThemeProvider defaultTheme="dark">
            <ThemeProbe />
          </ThemeProvider>
        )
      ).toContain('<output data-testid="theme">dark</output>');
    } finally {
      installDom();
    }
  });

  it("falls back when browser storage access throws", async () => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new Error("storage access denied");
      },
    });

    await renderThemeProvider("dark");

    expect(text("theme")).toBe("dark");

    await clickButton("Light");

    expect(text("theme")).toBe("light");
  });

  it("falls back when matchMedia is unavailable", async () => {
    Reflect.deleteProperty(window, "matchMedia");

    await renderThemeProvider("system");

    expect(readAppliedThemeState("light")).toEqual({
      colorScheme: "light",
      hasInverseTheme: false,
      hasTheme: true,
      resolvedTheme: "light",
    });
  });
});
