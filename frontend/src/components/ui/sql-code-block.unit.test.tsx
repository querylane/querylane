import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { SqlCodeBlock } from "@/components/ui/sql-code-block";

afterEach(() => {
  cleanup();
});

describe("SqlCodeBlock", () => {
  test("renders SQL snippets through Shiki while preserving copy text", () => {
    const sql = `-- Required before DROP ROLE "replicator";
CREATE ROLE "replicator" WITH LOGIN REPLICATION;
GRANT pg_read_all_data TO "replicator";
DROP ROLE "replicator";
SELECT 'active' AS status;`;

    const { container } = render(<SqlCodeBlock sql={sql} />);

    const code = container.querySelector(
      'code.language-sql[data-syntax-highlighter="shiki"]'
    );
    expect(code).not.toBeNull();
    expect(code?.textContent).toBe(sql);

    const tokenSpans = Array.from(
      container.querySelectorAll("[data-shiki-token]")
    );
    expect(tokenSpans.length).toBeGreaterThan(8);
    expect(
      tokenSpans.some((token) =>
        token
          .getAttribute("style")
          ?.includes("--querylane-sql-token-light")
      )
    ).toBe(true);
    expect(
      tokenSpans.some((token) =>
        token.getAttribute("style")?.includes("--querylane-sql-token-dark")
      )
    ).toBe(true);
  });

  test("removes the copy control and reserved padding together", () => {
    const { container } = render(
      <SqlCodeBlock copyable={false} sql="SELECT 1" />
    );

    expect(screen.queryByRole("button", { name: "Copy SQL" })).toBeNull();
    expect(container.querySelector("pre")?.className).not.toContain("pr-10");
  });

  test("preserves the empty-query placeholder", () => {
    const { container } = render(
      <SqlCodeBlock copyable={false} sql="—" variant="inline" />
    );

    const code = container.querySelector(
      'code.language-sql[data-syntax-highlighter="shiki"]'
    );
    expect(code?.textContent).toBe("—");
  });

  test("renders compact expressions without the default bordered gutter", () => {
    const { container } = render(
      <SqlCodeBlock
        copyable={false}
        sql="tenant_id = current_setting('app.tenant')"
        variant="compact"
      />
    );

    const pre = container.querySelector("pre");
    expect(pre?.className).toContain("border-0");
    expect(pre?.className).toContain("bg-muted/55");
    expect(pre?.className).toContain("px-3");
    expect(pre?.className).not.toContain("pr-10");
  });
});
