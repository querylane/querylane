import { afterEach, expect, rs, test } from "@rstest/core";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import * as shikiCore from "shiki/core" with { rstest: "importActual" };
import * as shikiEngine from "shiki/engine/javascript" with {
  rstest: "importActual",
};
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

rs.mock("shiki/core", () => ({
  ...shikiCore,
  createHighlighterCoreSync: rs.fn(shikiCore.createHighlighterCoreSync),
}));
rs.mock("shiki/engine/javascript", () => ({
  ...shikiEngine,
  createJavaScriptRegexEngine: rs.fn(shikiEngine.createJavaScriptRegexEngine),
}));

afterEach(() => {
  cleanup();
});

test("preloading table detail does not construct the SQL highlighter", async () => {
  const { createHighlighterCoreSync } = await import("shiki/core");

  // The same module loaded by database-explorer-preload, including SQL-only tabs.
  const { TableDetail } = await import(
    "@/features/data-explorer/explorer-table-detail"
  );

  expect(TableDetail).toBeTypeOf("function");
  // Other languages may initialize independently; this contract is SQL-specific.
  const sqlInitializations = rs
    .mocked(createHighlighterCoreSync)
    .mock.results.filter(
      (result) =>
        result.type === "return" &&
        result.value.getLoadedLanguages().includes("sql"),
    );
  expect(sqlInitializations).toHaveLength(0);
});

test("initializes once on first SQL tab activation and reuses it on remount", async () => {
  const user = userEvent.setup();
  const { createHighlighterCoreSync } = await import("shiki/core");
  const { createJavaScriptRegexEngine } = await import(
    "shiki/engine/javascript"
  );
  const { SqlCodeBlock, SqlSyntaxHighlight } = await import(
    "@/components/ui/sql-code-block"
  );
  const sql = "-- Customers\nSELECT '台北' AS city;";

  const { container } = render(
    <StrictMode>
      <Tabs defaultValue="columns">
        <TabsList>
          <TabsTrigger value="columns">Columns</TabsTrigger>
          <TabsTrigger value="definition">Definition</TabsTrigger>
        </TabsList>
        <TabsContent value="columns">Column metadata</TabsContent>
        <TabsContent value="definition">
          <SqlCodeBlock sql={sql} />
          <SqlSyntaxHighlight sql="SELECT 2;" />
        </TabsContent>
      </Tabs>
    </StrictMode>,
  );

  expect(screen.getByText("Column metadata")).toBeTruthy();
  expect(container.querySelector("code")).toBeNull();
  expect(createHighlighterCoreSync).not.toHaveBeenCalled();
  expect(createJavaScriptRegexEngine).not.toHaveBeenCalled();

  await user.click(screen.getByRole("tab", { name: "Definition" }));

  await waitFor(() => {
    expect(container.querySelector("code")?.textContent).toBe(sql);
  });
  expect(
    container.querySelectorAll("[data-shiki-token]").length,
  ).toBeGreaterThan(2);
  expect(screen.getByRole("button", { name: "Copy SQL" })).toBeTruthy();
  expect(createHighlighterCoreSync).toHaveBeenCalledTimes(1);
  expect(createJavaScriptRegexEngine).toHaveBeenCalledTimes(1);

  await user.click(screen.getByRole("tab", { name: "Columns" }));
  await waitFor(() => {
    expect(container.querySelector("code")).toBeNull();
  });
  await user.click(screen.getByRole("tab", { name: "Definition" }));
  await waitFor(() => {
    expect(container.querySelector("code")?.textContent).toBe(sql);
  });
  expect(createHighlighterCoreSync).toHaveBeenCalledTimes(1);
  expect(createJavaScriptRegexEngine).toHaveBeenCalledTimes(1);
});
