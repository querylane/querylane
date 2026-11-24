import {
  afterEach,
  beforeEach,
  describe,
  expect,
  rs,
  test,
} from "@rstest/core";
import { toast } from "sonner";
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

describe("ordinary SQL persistence failures", () => {
  beforeEach(() => {
    globalThis.dispatchEvent(new Event("pagehide"));
    rs.useFakeTimers();
  });

  afterEach(() => {
    rs.restoreAllMocks();
    globalThis.dispatchEvent(new Event("pagehide"));
    rs.useRealTimers();
  });

  test.each(["debounce", "pagehide"] as const)(
    "warns on %s write failure and saves the latest work when writes recover",
    async (trigger) => {
      const key = "querylane.sql-workbench.v1";
      const tabId = store().addTab(SCOPE);
      store().updateTabText(SCOPE, tabId, "select 1");
      const otherScope = scopeKey("local", "analytics");
      const otherTab = store().addTab(otherScope, { text: "select 10" });
      globalThis.dispatchEvent(new Event("pagehide"));
      const previousBytes = localStorage.getItem(key);
      expect(previousBytes).not.toBeNull();

      const notify = rs.spyOn(toast, "error");
      const dismiss = rs.spyOn(toast, "dismiss");
      const write = localStorage.setItem.bind(localStorage);
      const storageWrite = rs
        .spyOn(localStorage, "setItem")
        .mockImplementation((name, value) => {
          if (name === key) {
            throw new DOMException(
              "Storage quota exceeded",
              "QuotaExceededError"
            );
          }
          write(name, value);
        });

      try {
        store().updateTabText(SCOPE, tabId, "select 2");
        store().saveQuery(SCOPE, {
          name: "Draft",
          statement: "select 2",
          tabId,
        });

        expect(() => {
          if (trigger === "debounce") {
            rs.advanceTimersByTime(250);
          } else {
            globalThis.dispatchEvent(new Event("pagehide"));
          }
        }).not.toThrow();
        expect(notify).toHaveBeenCalledWith(
          "SQL changes are only stored in memory",
          expect.objectContaining({
            duration: Number.POSITIVE_INFINITY,
            id: "sql-workbench-write-failed",
          })
        );
        expect(localStorage.getItem(key)).toBe(previousBytes);
        expect(
          store().workspaces[SCOPE]?.tabs.find((tab) => tab.id === tabId)?.text
        ).toBe("select 2");

        storageWrite.mockRestore();
        globalThis.dispatchEvent(new Event("pagehide"));
        expect(dismiss).toHaveBeenCalledWith("sql-workbench-write-failed");
        await useSqlWorkbenchStore.persist.rehydrate();
        expect(
          store().workspaces[SCOPE]?.tabs.find((tab) => tab.id === tabId)?.text
        ).toBe("select 2");

        store().updateTabText(SCOPE, tabId, "select 3");
        globalThis.dispatchEvent(new Event("pagehide"));
        await useSqlWorkbenchStore.persist.rehydrate();
        expect(
          store().workspaces[SCOPE]?.tabs.find((tab) => tab.id === tabId)?.text
        ).toBe("select 3");
        expect(store().savedQueries[SCOPE]?.[0]?.statement).toBe("select 2");
        expect(
          store().workspaces[otherScope]?.tabs.find(
            (tab) => tab.id === otherTab
          )?.text
        ).toBe("select 10");
      } finally {
        storageWrite.mockRestore();
      }
    }
  );
});

describe("persisted workbench validation", () => {
  test("does not overwrite rejected work if its recovery copy exceeds storage quota", async () => {
    const key = "querylane.sql-workbench.v1";
    const raw = JSON.stringify({ version: 0, state: { workspaces: "broken" } });
    localStorage.setItem(key, raw);
    const write = localStorage.setItem.bind(localStorage);
    const storageWrite = rs
      .spyOn(localStorage, "setItem")
      .mockImplementation((name, value) => {
        if (name.endsWith(".recovery")) {
          throw new DOMException(
            "Storage quota exceeded",
            "QuotaExceededError"
          );
        }
        write(name, value);
      });
    try {
      await useSqlWorkbenchStore.persist.rehydrate();
      store().ensureWorkspace(SCOPE);
      globalThis.dispatchEvent(new Event("pagehide"));
      expect(localStorage.getItem(key)).toBe(raw);
    } finally {
      storageWrite.mockRestore();
      localStorage.clear();
      await useSqlWorkbenchStore.persist.rehydrate();
    }
  });
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
