import { expect, rs, test } from "@rstest/core";
import { render } from "@testing-library/react";
import { BashSyntaxHighlight } from "./bash-syntax-highlight-content";
import { SqlSyntaxHighlight } from "./sql-syntax-highlight-content";

const { initialize } = rs.hoisted(() => ({
  initialize: rs.fn(() => {
    throw new Error("Grammar initialization failed");
  }),
}));
rs.mock("shiki/core", () => ({ createHighlighterCoreSync: initialize }));

test.each([
  {
    language: "sql",
    renderCode: (source: string) => <SqlSyntaxHighlight sql={source} />,
  },
  {
    language: "bash",
    renderCode: (source: string) => <BashSyntaxHighlight code={source} />,
  },
])(
  "$language initialization failure stays local and readable",
  ({ renderCode }) => {
    const source = "  initialization failure\r\n\t🙂\n";
    const { container } = render(renderCode(source));
    expect(container.querySelector("code")?.textContent).toBe(source);
    expect(container.querySelector("[role=status]")?.textContent).toBe(
      "Syntax highlighting unavailable. Showing plain text."
    );
    expect(initialize).toHaveBeenCalledTimes(1);
  }
);
