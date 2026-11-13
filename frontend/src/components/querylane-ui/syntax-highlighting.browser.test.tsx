import { cleanup, render } from "@rstest/browser-react";
import { afterEach, expect, test } from "@rstest/core";
import { BashSyntaxHighlight } from "./bash-syntax-highlight";
import { SqlSyntaxHighlight } from "./sql-code-block";

const SQL_SOURCE = "\tSELECT 'active' AS status;  \r\n\n";
const BASH_SOURCE = '\techo "$POSTGRES_HOST"  \r\n\n';

afterEach(async () => {
  await cleanup();
});

test.each([
  {
    language: "sql",
    source: SQL_SOURCE,
    content: <SqlSyntaxHighlight sql={SQL_SOURCE} />,
  },
  {
    language: "bash",
    source: BASH_SOURCE,
    content: <BashSyntaxHighlight code={BASH_SOURCE} />,
  },
])(
  "$language tokens follow the global theme after lazy loading",
  async ({ language, content, source }) => {
    const originalClassName = document.documentElement.className;
    await render(content);

    await expect
      .poll(() => document.querySelectorAll("[data-shiki-token]").length)
      .toBeGreaterThan(0);

    expect(document.querySelector("code")?.textContent).toBe(source);

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

test("oversized SQL and Bash remain exact plaintext in Chromium", async () => {
  const source = `\t${"🙂".repeat(32_768)}\r\n`;
  await render(
    <>
      <pre>
        <SqlSyntaxHighlight sql={source} />
      </pre>
      <pre>
        <BashSyntaxHighlight code={source} />
      </pre>
    </>
  );
  expect(
    [...document.querySelectorAll("code")].map((code) => code.textContent)
  ).toEqual([source, source]);
  expect(document.querySelectorAll("[data-shiki-token]")).toHaveLength(0);
});
