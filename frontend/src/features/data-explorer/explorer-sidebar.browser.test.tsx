import { expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { ScreenshotFrame } from "@/__tests__/browser-test-utils";
import {
  CATEGORY_ORDER,
  type CategoryKey,
} from "@/features/data-explorer/data-explorer-types";
import { ExplorerSidebar } from "@/features/data-explorer/explorer-sidebar";

const TEST_NUMBER_4 = 4;
const TEST_NUMBER_48 = 48;

const defaultSchema = {
  id: "schema-pg-catalog",
  name: "pg_catalog",
  owner: "postgres",
};
const FIRST_TABLE_BUTTON_RE = /table_0000/i;
const LAST_TABLE_BUTTON_RE = /table_0999/i;

function categoryPagination() {
  return Object.fromEntries(
    CATEGORY_ORDER.map((category) => [
      category,
      { hasNextPage: false, isFetchingNextPage: false, isLoading: false },
    ])
  ) as Record<
    CategoryKey,
    { hasNextPage: boolean; isFetchingNextPage: boolean; isLoading: boolean }
  >;
}

function renderLargeExplorerSidebar() {
  const tables = Array.from({ length: 1000 }, (_, index) => ({
    name: `table_${index.toString().padStart(TEST_NUMBER_4, "0")}`,
    sizeLabel: `${index + 1} KB`,
  }));

  render(
    <ScreenshotFrame>
      <div className="flex h-[760px] w-[320px] overflow-hidden rounded-2xl border border-border bg-background">
        <ExplorerSidebar
          activeSchema={defaultSchema}
          categoryPagination={{
            schemas: { hasNextPage: false, isFetchingNextPage: false },
            ...categoryPagination(),
          }}
          databaseLabel="demo_ecommerce"
          expandedCategories={new Set(["tables"])}
          itemsByCategory={{
            tables,
            views: [],
          }}
          onLoadMoreCategory={vi.fn()}
          onLoadMoreSchemas={vi.fn()}
          onRetryTables={vi.fn()}
          onRetryViews={vi.fn()}
          onSelectResource={vi.fn()}
          onSelectSchema={vi.fn()}
          onSelectSchemaOverview={vi.fn()}
          query=""
          schemaSelectionError={null}
          schemas={[defaultSchema]}
          schemasLoading={false}
          schemasSyncNotice={null}
          selection={{ kind: "schema" }}
          setExpandedCategories={vi.fn()}
          setQuery={vi.fn()}
          tablesError={null}
          tablesSyncNotice={null}
          viewsError={null}
        />
      </div>
    </ScreenshotFrame>
  );
}

function firstVisibleResourceGap(scrollRoot: HTMLElement): number {
  const rootBox = scrollRoot.getBoundingClientRect();
  const visibleResource = Array.from(
    scrollRoot.querySelectorAll<HTMLButtonElement>("button")
  ).find((button) => {
    if (!button.textContent?.startsWith("table_")) {
      return false;
    }
    const buttonBox = button.getBoundingClientRect();
    return buttonBox.bottom > rootBox.top && buttonBox.top < rootBox.bottom;
  });

  if (!visibleResource) {
    throw new Error("expected at least one visible resource button");
  }

  return visibleResource.getBoundingClientRect().top - rootBox.top;
}

test("virtualized object list keeps fast bottom scroll filled from the top", async () => {
  renderLargeExplorerSidebar();

  await expect
    .element(page.getByRole("button", { name: FIRST_TABLE_BUTTON_RE }))
    .toBeVisible();

  const scrollRoot = page
    .getByTestId("resource-list-scroll")
    .element() as HTMLElement;
  scrollRoot.scrollTop = scrollRoot.scrollHeight;
  scrollRoot.dispatchEvent(new Event("scroll", { bubbles: true }));

  await expect
    .element(page.getByRole("button", { name: LAST_TABLE_BUTTON_RE }))
    .toBeVisible();

  expect(firstVisibleResourceGap(scrollRoot)).toBeLessThan(TEST_NUMBER_48);
});

test("virtualized object list commits a fast bottom scroll after the next frame", async () => {
  renderLargeExplorerSidebar();

  await expect
    .element(page.getByRole("button", { name: FIRST_TABLE_BUTTON_RE }))
    .toBeVisible();

  const scrollRoot = page
    .getByTestId("resource-list-scroll")
    .element() as HTMLElement;
  scrollRoot.scrollTop = scrollRoot.scrollHeight;
  scrollRoot.dispatchEvent(new Event("scroll", { bubbles: true }));

  expect(scrollRoot.textContent).not.toContain("table_0999");
  await expect
    .element(page.getByRole("button", { name: LAST_TABLE_BUTTON_RE }))
    .toBeVisible();
  expect(firstVisibleResourceGap(scrollRoot)).toBeLessThan(TEST_NUMBER_48);
});
