import { afterEach, expect, test } from "vitest";
import { cleanup, render } from "vitest-browser-react";
import { BashSyntaxHighlight } from "./bash-syntax-highlight";
import { SqlSyntaxHighlight } from "./sql-code-block";

afterEach(async () => {
  await cleanup();
});

test.each([
  {
    language: "sql",
    content: <SqlSyntaxHighlight sql="SELECT 'active' AS status;" />,
  },
  {
    language: "bash",
    content: <BashSyntaxHighlight code='echo "$POSTGRES_HOST"' />,
  },
])(
  "$language tokens follow the global theme after lazy loading",
  async ({ language, content }) => {
    const originalClassName = document.documentElement.className;
    render(content);

    await expect
      .poll(() => document.querySelectorAll("[data-shiki-token]").length)
      .toBeGreaterThan(0);

    const tokens = document.querySelectorAll<HTMLElement>("[data-shiki-token]");
    try {
      for (const theme of ["light", "dark", "light"]) {
        document.documentElement.classList.toggle("dark", theme === "dark");
        document.documentElement.classList.toggle("light", theme === "light");

        for (const token of tokens) {
          const expectedColor = document.createElement("span");
          expectedColor.style.color = token.style.getPropertyValue(
            `--querylane-${language}-token-${theme}`
          );
          expect(expectedColor.style.color).not.toBe("");
          expect(getComputedStyle(token).color).toBe(expectedColor.style.color);
        }
      }
    } finally {
      document.documentElement.className = originalClassName;
    }
  }
);
