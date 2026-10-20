import { beforeEach, describe, expect, test } from "@rstest/core";
import {
  MAX_HISTORY_ENTRIES,
  scopeKey,
  useSqlWorkbenchStore,
} from "@/features/sql-workbench/sql-workbench-store";

const SCOPE = scopeKey("local", "postgres");

function store() {
  return useSqlWorkbenchStore.getState();
}

beforeEach(() => {
  localStorage.clear();
  useSqlWorkbenchStore.setState({
    history: {},
    savedQueries: {},
    workspaces: {},
  });
});

describe("tabs", () => {
  test("creates a numbered tab and activates it", () => {
    const first = store().addTab(SCOPE);
    const second = store().addTab(SCOPE);
    const workspace = store().workspaces[SCOPE];
    expect(workspace?.tabs.map((tab) => tab.title)).toEqual([
      "Query 1",
      "Query 2",
      "Query 3",
    ]);
    expect(workspace?.activeTabId).toBe(second);
    expect(first).not.toBe(second);
  });

  test("keeps drafts per tab and per scope", () => {
    const tabId = store().addTab(SCOPE);
    store().updateTabText(SCOPE, tabId, "select 1");
    const otherScope = scopeKey("local", "analytics");
    const otherTab = store().addTab(otherScope);
    store().updateTabText(otherScope, otherTab, "select 2");

    expect(
      store().workspaces[SCOPE]?.tabs.find((tab) => tab.id === tabId)?.text
    ).toBe("select 1");
    expect(
      store().workspaces[otherScope]?.tabs.find((tab) => tab.id === otherTab)
        ?.text
    ).toBe("select 2");
  });

  test("activates the neighbour when the active tab closes and never leaves zero tabs", () => {
    const a = store().addTab(SCOPE);
    const b = store().addTab(SCOPE);
    store().setActiveTab(SCOPE, a);
    store().closeTab(SCOPE, a);
    expect(store().workspaces[SCOPE]?.activeTabId).toBe(b);

    const remaining = store().workspaces[SCOPE]?.tabs ?? [];
    for (const tab of remaining) {
      store().closeTab(SCOPE, tab.id);
    }
    const workspace = store().workspaces[SCOPE];
    expect(workspace?.tabs).toHaveLength(1);
    expect(workspace?.activeTabId).toBe(workspace?.tabs[0]?.id);
  });
});

describe("history", () => {
  test("prepends entries and caps the list", () => {
    for (let index = 0; index < MAX_HISTORY_ENTRIES + 5; index += 1) {
      store().recordHistory(SCOPE, {
        durationMs: index,
        startedAt: index,
        statement: `select ${index}`,
        status: "ok",
      });
    }
    const history = store().history[SCOPE] ?? [];
    expect(history).toHaveLength(MAX_HISTORY_ENTRIES);
    expect(history[0]?.statement).toBe(`select ${MAX_HISTORY_ENTRIES + 4}`);
  });

  test("clears history for one scope only", () => {
    const otherScope = scopeKey("local", "analytics");
    store().recordHistory(SCOPE, {
      durationMs: 1,
      startedAt: 1,
      statement: "select 1",
      status: "ok",
    });
    store().recordHistory(otherScope, {
      durationMs: 1,
      startedAt: 1,
      statement: "select 2",
      status: "error",
    });
    store().clearHistory(SCOPE);
    expect(store().history[SCOPE]).toEqual([]);
    expect(store().history[otherScope]).toHaveLength(1);
  });
});

describe("saved queries", () => {
  test("saves a query, links the tab and reopens it without duplicating tabs", () => {
    const tabId = store().addTab(SCOPE);
    store().updateTabText(SCOPE, tabId, "select now()");
    const savedId = store().saveQuery(SCOPE, {
      name: "Current time",
      statement: "select now()",
      tabId,
    });

    const tab = store().workspaces[SCOPE]?.tabs.find((t) => t.id === tabId);
    expect(tab).toMatchObject({ savedQueryId: savedId, title: "Current time" });

    expect(store().openSavedQuery(SCOPE, savedId)).toBe(tabId);
    expect(store().workspaces[SCOPE]?.tabs).toHaveLength(2);

    store().updateTabText(SCOPE, tabId, "select now() -- edited");
    const reopened = store().openSavedQuery(SCOPE, savedId);
    expect(reopened).not.toBe(tabId);
    expect(store().workspaces[SCOPE]?.tabs).toHaveLength(3);
  });

  test("unlinks tabs when a saved query is deleted", () => {
    const tabId = store().addTab(SCOPE);
    const savedId = store().saveQuery(SCOPE, {
      name: "x",
      statement: "select 1",
      tabId,
    });
    store().deleteSavedQuery(SCOPE, savedId);
    expect(store().savedQueries[SCOPE]).toEqual([]);
    expect(
      store().workspaces[SCOPE]?.tabs.find((t) => t.id === tabId)?.savedQueryId
    ).toBeUndefined();
  });
});

describe("persisted workbench validation", () => {
  test("rejects malformed stored data without replacing drafts or deleting recovery bytes", async () => {
    const tabId = store().addTab(SCOPE);
    store().updateTabText(SCOPE, tabId, "SELECT 'keep this draft'");
    const before = store().workspaces;
    const raw = JSON.stringify({
      version: 0,
      state: { history: {}, savedQueries: {}, workspaces: "broken" },
    });
    localStorage.setItem("querylane.sql-workbench.v1", raw);

    await useSqlWorkbenchStore.persist.rehydrate();

    expect(store().workspaces).toEqual(before);
    expect(localStorage.getItem("querylane.sql-workbench.v1")).toBe(raw);
  });
});
