import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, rs } from "@rstest/core";
import { SqlCodeBlock } from "@/components/ui/sql-code-block";

const highlighter = rs.hoisted(() => ({
  creations: 0,
  codeToTokensWithThemes: rs.fn((sqlText: string) => [
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

rs.mock("shiki/core", () => ({
  createHighlighterCoreSync: () => {
    highlighter.creations += 1;
    return highlighter;
  },
}));

afterEach(() => {
  cleanup();
});

describe("SqlCode token cache", () => {
  test("defers highlighting without delaying text and tokenizes duplicate SQL once", async () => {
    expect(highlighter.creations).toBe(0);
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
    await waitFor(() => {
      expect(highlighter.creations).toBe(1);
      expect(highlighter.codeToTokensWithThemes).toHaveBeenCalledTimes(1);
    });
  });
});
