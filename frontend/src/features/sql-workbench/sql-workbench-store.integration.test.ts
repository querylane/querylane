import { afterEach, expect, test } from "@rstest/core";
import {
  scopeKey,
  useSqlWorkbenchStore,
} from "@/features/sql-workbench/sql-workbench-store";

const STORAGE_KEY = "querylane.sql-workbench.v1";

afterEach(async () => {
  globalThis.dispatchEvent(new Event("pagehide"));
  localStorage.clear();
  await useSqlWorkbenchStore.persist.rehydrate();
});

test("recovers a workspace whose active tab is missing and persists new drafts without losing recovery data", async () => {
  const scope = scopeKey("local", "postgres");
  const rejected = JSON.stringify({
    version: 0,
    state: {
      history: {},
      savedQueries: {},
      workspaces: {
        [scope]: {
          activeTabId: "deleted-tab",
          nextTabNumber: 2,
          tabs: [
            {
              createdAt: 1,
              id: "saved-tab",
              text: "SELECT 'recover this draft'",
              title: "Query 1",
            },
          ],
        },
      },
    },
  });
  localStorage.setItem(STORAGE_KEY, rejected);

  await useSqlWorkbenchStore.persist.rehydrate();
  useSqlWorkbenchStore.getState().ensureWorkspace(scope);

  const workspace = useSqlWorkbenchStore.getState().workspaces[scope];
  expect(workspace?.tabs).toHaveLength(1);
  expect(workspace?.tabs[0]).toMatchObject({ text: "", title: "Query 1" });
  expect(workspace?.activeTabId).toBe(workspace?.tabs[0]?.id);
  expect(localStorage.getItem(`${STORAGE_KEY}.recovery`)).toBe(rejected);

  if (!workspace) {
    throw new Error("Expected a recovered workspace");
  }
  useSqlWorkbenchStore
    .getState()
    .updateTabText(scope, workspace.activeTabId, "SELECT 'new draft'");
  globalThis.dispatchEvent(new Event("pagehide"));
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null")).toMatchObject(
    {
      version: 0,
      state: {
        workspaces: {
          [scope]: {
            activeTabId: workspace.activeTabId,
            tabs: [{ text: "SELECT 'new draft'", title: "Query 1" }],
          },
        },
      },
    }
  );
  expect(localStorage.getItem(`${STORAGE_KEY}.recovery`)).toBe(rejected);
});
