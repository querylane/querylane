import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { SqlCodeBlock } from "@/components/ui/sql-code-block";

const highlighter = vi.hoisted(() => ({
  codeToTokensWithThemes: vi.fn((sqlText: string) => [
    [
      {
        content: sqlText,
        variants: {
          dark: { color: "#ffffff" },
          light: { color: "#000000" },
        },
      },
    ],
  ]),
}));

vi.mock("shiki/core", () => ({
  createHighlighterCoreSync: () => highlighter,
}));

afterEach(() => {
  cleanup();
});

describe("SqlCode token cache", () => {
  test("tokenizes duplicate SQL once across component instances", () => {
    const sql = "SELECT * FROM shipping.shipments WHERE id = $1";

    const { container } = render(
      <>
        <SqlCodeBlock copyable={false} sql={sql} variant="inline" />
        <SqlCodeBlock copyable={false} sql={sql} variant="inline" />
      </>
    );

    expect(
      Array.from(container.querySelectorAll("code"), (code) => code.textContent)
    ).toEqual([sql, sql]);
    expect(highlighter.codeToTokensWithThemes).toHaveBeenCalledTimes(1);
  });
});
