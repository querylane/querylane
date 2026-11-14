import { expect, rs, test } from "@rstest/core";
import { Window } from "happy-dom";
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

test("server rendering uses the supplied default without browser globals", async () => {
  rs.stubGlobal("window", undefined);
  rs.stubGlobal("document", undefined);
  const browser = new Window();
  try {
    const markup = renderToStaticMarkup(
      <ThemeProvider defaultTheme="dark">
        <ThemeProbe />
      </ThemeProvider>
    );
    browser.document.write(markup);
    expect(browser.document.querySelector("output")?.textContent).toBe("dark");
  } finally {
    rs.unstubAllGlobals();
    await browser.happyDOM.close();
  }
});
