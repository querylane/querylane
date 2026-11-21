import { beforeEach, expect, rs, test } from "@rstest/core";
import { cleanup, render } from "@testing-library/react";
import type { ThemedTokenWithVariants } from "shiki";
import { BashSyntaxHighlight } from "./bash-syntax-highlight-content";
import { SqlSyntaxHighlight } from "./sql-syntax-highlight-content";

const { tokenize } = rs.hoisted(() => ({
  tokenize: rs.fn<(source: string) => ThemedTokenWithVariants[][]>(),
}));

rs.mock("shiki/core", () => ({
  createHighlighterCoreSync: () => ({ codeToTokensWithThemes: tokenize }),
}));

const LINE_ENDING = /\r?\n/u;

beforeEach(() => {
  tokenize.mockImplementation((source) =>
    source.split(LINE_ENDING).map((content) => [
      {
        content,
        offset: 0,
        variants: { light: { color: "red" }, dark: { color: "blue" } },
      },
    ])
  );
});

const languages = [
  {
    language: "SQL",
    renderCode: (source: string) => <SqlSyntaxHighlight sql={source} />,
  },
  {
    language: "Bash",
    renderCode: (source: string) => <BashSyntaxHighlight code={source} />,
  },
];

test.each(languages)(
  "$language bypasses tokenization above 65,536 JS code units",
  ({ renderCode }) => {
    const source = ` \t${"🙂".repeat(32_768)}\n`;
    const { container } = render(renderCode(source));
    expect(container.querySelector("code")?.textContent).toBe(source);
    expect(container.querySelectorAll("[data-shiki-token]")).toHaveLength(0);
    expect(tokenize).not.toHaveBeenCalled();
    cleanup();
  }
);

test("SQL and Bash share a payload budget, retaining recent tokens and evicting older large sources", () => {
  const sources = Array.from(
    { length: 10 },
    (_, index) => `-- cache-${index} ${"x".repeat(60_000)}`
  );
  for (const [index, source] of sources.entries()) {
    render(
      index % 2 === 0 ? (
        <SqlSyntaxHighlight sql={source} />
      ) : (
        <BashSyntaxHighlight code={source} />
      )
    );
    cleanup();
  }
  tokenize.mockClear();
  render(<BashSyntaxHighlight code={sources[9] ?? ""} />);
  expect(tokenize).not.toHaveBeenCalled();
  cleanup();
  render(<SqlSyntaxHighlight sql={sources[0] ?? ""} />);
  expect(tokenize).toHaveBeenCalledTimes(1);
  cleanup();
  const smallSources = Array.from(
    { length: 10 },
    (_, index) => `small-cache-${index}`
  );
  for (const source of smallSources) {
    render(<SqlSyntaxHighlight sql={source} />);
    cleanup();
  }
  tokenize.mockClear();
  render(<SqlSyntaxHighlight sql={smallSources[0] ?? ""} />);
  expect(tokenize).not.toHaveBeenCalled();
});

test.each(languages)(
  "$language bounds token DOM work for small but fragmented input",
  ({ renderCode }) => {
    tokenize.mockImplementationOnce(() => [
      Array.from({ length: 8193 }, () => ({
        content: "x",
        offset: 0,
        variants: { light: { color: "red" }, dark: { color: "blue" } },
      })),
    ]);
    const source = "x".repeat(8193);
    const { container } = render(renderCode(source));
    expect(container.querySelector("code")?.textContent).toBe(source);
    expect(container.querySelectorAll("[data-shiki-token]")).toHaveLength(0);
  }
);

test.each(languages)(
  "$language skips blank-line-heavy tokenization and line elements",
  ({ renderCode }) => {
    const source = "\n".repeat(4096);
    const { container } = render(renderCode(source));
    expect(container.querySelector("code")?.textContent).toBe(source);
    expect(container.querySelectorAll("[data-shiki-line]")).toHaveLength(0);
    expect(tokenize).not.toHaveBeenCalled();
  }
);

test.each(languages)(
  "$language tokenizer errors preserve exact source and report the local degraded state",
  ({ renderCode }) => {
    tokenize.mockImplementationOnce(() => {
      throw new Error("Tokenizer unavailable");
    });
    const source = "\t tokenizer failure  \nSELECT '🙂';\n";
    const { container } = render(renderCode(source));
    expect(container.querySelector("code")?.textContent).toBe(source);
    expect(container.querySelector("[role=status]")?.textContent).toBe(
      "Syntax highlighting unavailable. Showing plain text."
    );
  }
);

test.each(languages)(
  "$language keeps original mixed line endings, tabs, blank lines and Unicode in healthy tokens",
  ({ renderCode }) => {
    const source = "\tSELECT '🙂';  \r\n\r\n  -- tail\n\t";
    const { container } = render(renderCode(source));
    expect(container.querySelector("code")?.textContent).toBe(source);
    expect(
      container.querySelectorAll("[data-shiki-token]").length
    ).toBeGreaterThan(0);
  }
);

test.each(languages)(
  "$language still highlights at the 65,536 code-unit limit",
  ({ renderCode }) => {
    const source = "🙂".repeat(32_768);
    const { container } = render(renderCode(source));
    expect(container.querySelector("code")?.textContent).toBe(source);
    expect(container.querySelectorAll("[data-shiki-token]")).toHaveLength(1);
    expect(tokenize).toHaveBeenCalledTimes(1);
  }
);
