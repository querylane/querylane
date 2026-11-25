import { expect, rs, test } from "@rstest/core";
import { renderToStaticMarkup } from "react-dom/server";
import { useTheme } from "@/theme-context";
import { ThemeProvider } from "@/theme-provider";

function ThemeProbe() {
  const { theme } = useTheme();
  return <output>{theme}</output>;
}

test("useTheme requires its provider", () => {
  expect(() => renderToStaticMarkup(<ThemeProbe />)).toThrow(
    "useTheme must be used within a ThemeProvider"
  );
});

test("server rendering uses the supplied default without browser globals", () => {
  const parser = new DOMParser();
  rs.stubGlobal("window", undefined);
  rs.stubGlobal("document", undefined);
  try {
    const markup = renderToStaticMarkup(
      <ThemeProvider defaultTheme="dark">
        <ThemeProbe />
      </ThemeProvider>
    );
    const renderedDocument = parser.parseFromString(markup, "text/html");
    expect(renderedDocument.querySelector("output")?.textContent).toBe("dark");
  } finally {
    rs.unstubAllGlobals();
  }
});
