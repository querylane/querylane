import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * Editor tabs, run history and saved queries for the SQL workbench.
 *
 * Everything here is scoped to one database (`instanceId/databaseId`) so
 * switching databases never shows another database's drafts. State lives in
 * localStorage for now: the roadmap's saved-query library moves it server-side
 * once Querylane has user identity.
 */

type HistoryStatus = "ok" | "error" | "cancelled";

interface SqlTab {
  createdAt: number;
  id: string;
  /** Saved query this tab was opened from, if any. */
  savedQueryId?: string | undefined;
  text: string;
  title: string;
}

interface SqlHistoryEntry {
  durationMs: number;
  errorSummary?: string | undefined;
  id: string;
  rowCount?: number | undefined;
  startedAt: number;
  statement: string;
  status: HistoryStatus;
}

interface SavedQuery {
  createdAt: number;
  id: string;
  name: string;
  statement: string;
  updatedAt: number;
}

interface SqlWorkspace {
  activeTabId: string;
  nextTabNumber: number;
  tabs: SqlTab[];
}

interface SqlWorkbenchState {
  addTab: (
    scope: string,
    tab?: Partial<Pick<SqlTab, "text" | "title">>
  ) => string;
  clearHistory: (scope: string) => void;
  closeTab: (scope: string, tabId: string) => void;
  deleteSavedQuery: (scope: string, id: string) => void;
  ensureWorkspace: (scope: string) => void;
  history: Record<string, SqlHistoryEntry[]>;
  openSavedQuery: (scope: string, id: string) => string | undefined;
  recordHistory: (scope: string, entry: Omit<SqlHistoryEntry, "id">) => void;
  savedQueries: Record<string, SavedQuery[]>;
  saveQuery: (
    scope: string,
    input: { name: string; statement: string; tabId?: string | undefined }
  ) => string;
  setActiveTab: (scope: string, tabId: string) => void;
  updateTabText: (scope: string, tabId: string, text: string) => void;
  workspaces: Record<string, SqlWorkspace>;
}

const STORAGE_KEY = "querylane.sql-workbench.v1";
const MAX_HISTORY_ENTRIES = 100;
const DEFAULT_TAB_TITLE_PREFIX = "Query";

const ID_RADIX = 36;
const ID_RANDOM_START = 2;
const ID_RANDOM_END = 10;

function generateId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  const random = Math.random()
    .toString(ID_RADIX)
    .slice(ID_RANDOM_START, ID_RANDOM_END);
  return `${Date.now().toString(ID_RADIX)}-${random}`;
}

function scopeKey(instanceId: string, databaseId: string): string {
  return `${instanceId}/${databaseId}`;
}

function createTab(
  title: string,
  overrides: Partial<Pick<SqlTab, "savedQueryId" | "text" | "title">> = {}
): SqlTab {
  return {
    createdAt: Date.now(),
    id: generateId(),
    text: "",
    title,
    ...overrides,
  };
}

function createWorkspace(): SqlWorkspace {
  const tab = createTab(`${DEFAULT_TAB_TITLE_PREFIX} 1`);
  return { activeTabId: tab.id, nextTabNumber: 2, tabs: [tab] };
}

function workspaceFor(
  workspaces: Record<string, SqlWorkspace>,
  scope: string
): SqlWorkspace {
  return workspaces[scope] ?? createWorkspace();
}

function withWorkspace(
  state: SqlWorkbenchState,
  scope: string,
  update: (workspace: SqlWorkspace) => SqlWorkspace
): Pick<SqlWorkbenchState, "workspaces"> {
  return {
    workspaces: {
      ...state.workspaces,
      [scope]: update(workspaceFor(state.workspaces, scope)),
    },
  };
}

function nextActiveTabAfterClose({
  activeTabId,
  closedIndex,
  closedTabId,
  tabs,
}: {
  activeTabId: string;
  closedIndex: number;
  closedTabId: string;
  tabs: SqlTab[];
}): string {
  if (activeTabId !== closedTabId) {
    return activeTabId;
  }
  const neighbour = tabs[Math.min(closedIndex, tabs.length - 1)];
  return neighbour?.id ?? activeTabId;
}

const useSqlWorkbenchStore = create<SqlWorkbenchState>()(
  persist(
    (set, get) => ({
      addTab: (scope, tab) => {
        const workspace = workspaceFor(get().workspaces, scope);
        const created = createTab(
          tab?.title ??
            `${DEFAULT_TAB_TITLE_PREFIX} ${workspace.nextTabNumber}`,
          { text: tab?.text ?? "" }
        );
        set((state) =>
          withWorkspace(state, scope, (current) => ({
            activeTabId: created.id,
            nextTabNumber: tab?.title
              ? current.nextTabNumber
              : current.nextTabNumber + 1,
            tabs: [...current.tabs, created],
          }))
        );
        return created.id;
      },
      clearHistory: (scope) => {
        set((state) => ({ history: { ...state.history, [scope]: [] } }));
      },
      closeTab: (scope, tabId) => {
        set((state) =>
          withWorkspace(state, scope, (current) => {
            const index = current.tabs.findIndex((tab) => tab.id === tabId);
            if (index === -1) {
              return current;
            }
            const tabs = current.tabs.filter((tab) => tab.id !== tabId);
            if (tabs.length === 0) {
              const replacement = createTab(
                `${DEFAULT_TAB_TITLE_PREFIX} ${current.nextTabNumber}`
              );
              return {
                activeTabId: replacement.id,
                nextTabNumber: current.nextTabNumber + 1,
                tabs: [replacement],
              };
            }
            return {
              ...current,
              activeTabId: nextActiveTabAfterClose({
                activeTabId: current.activeTabId,
                closedIndex: index,
                closedTabId: tabId,
                tabs,
              }),
              tabs,
            };
          })
        );
      },
      deleteSavedQuery: (scope, id) => {
        set((state) => ({
          savedQueries: {
            ...state.savedQueries,
            [scope]: (state.savedQueries[scope] ?? []).filter(
              (query) => query.id !== id
            ),
          },
          ...withWorkspace(state, scope, (current) => ({
            ...current,
            tabs: current.tabs.map((tab) =>
              tab.savedQueryId === id
                ? { ...tab, savedQueryId: undefined }
                : tab
            ),
          })),
        }));
      },
      ensureWorkspace: (scope) => {
        if (!get().workspaces[scope]) {
          set((state) => withWorkspace(state, scope, (current) => current));
        }
      },
      history: {},
      openSavedQuery: (scope, id) => {
        const query = (get().savedQueries[scope] ?? []).find(
          (candidate) => candidate.id === id
        );
        if (!query) {
          return;
        }
        const workspace = workspaceFor(get().workspaces, scope);
        const existing = workspace.tabs.find(
          (tab) => tab.savedQueryId === id && tab.text === query.statement
        );
        if (existing) {
          get().setActiveTab(scope, existing.id);
          return existing.id;
        }
        const created = createTab(query.name, {
          savedQueryId: id,
          text: query.statement,
        });
        set((state) =>
          withWorkspace(state, scope, (current) => ({
            ...current,
            activeTabId: created.id,
            tabs: [...current.tabs, created],
          }))
        );
        return created.id;
      },
      recordHistory: (scope, entry) => {
        set((state) => ({
          history: {
            ...state.history,
            [scope]: [
              { ...entry, id: generateId() },
              ...(state.history[scope] ?? []),
            ].slice(0, MAX_HISTORY_ENTRIES),
          },
        }));
      },
      saveQuery: (scope, input) => {
        const now = Date.now();
        const query: SavedQuery = {
          createdAt: now,
          id: generateId(),
          name: input.name,
          statement: input.statement,
          updatedAt: now,
        };
        set((state) => ({
          savedQueries: {
            ...state.savedQueries,
            [scope]: [query, ...(state.savedQueries[scope] ?? [])],
          },
          ...(input.tabId
            ? withWorkspace(state, scope, (current) => ({
                ...current,
                tabs: current.tabs.map((tab) =>
                  tab.id === input.tabId
                    ? { ...tab, savedQueryId: query.id, title: query.name }
                    : tab
                ),
              }))
            : {}),
        }));
        return query.id;
      },
      savedQueries: {},
      setActiveTab: (scope, tabId) => {
        set((state) =>
          withWorkspace(state, scope, (current) =>
            current.tabs.some((tab) => tab.id === tabId)
              ? { ...current, activeTabId: tabId }
              : current
          )
        );
      },
      updateTabText: (scope, tabId, text) => {
        set((state) =>
          withWorkspace(state, scope, (current) => ({
            ...current,
            tabs: current.tabs.map((tab) =>
              tab.id === tabId ? { ...tab, text } : tab
            ),
          }))
        );
      },
      workspaces: {},
    }),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({
        history: state.history,
        savedQueries: state.savedQueries,
        workspaces: state.workspaces,
      }),
      storage: createJSONStorage(() => localStorage),
    }
  )
);

/** Reads a scope's workspace, materialising the default one when absent. */
function selectWorkspace(
  state: Pick<SqlWorkbenchState, "workspaces">,
  scope: string
): SqlWorkspace | undefined {
  return state.workspaces[scope];
}

export type {
  HistoryStatus,
  SavedQuery,
  SqlHistoryEntry,
  SqlTab,
  SqlWorkspace,
};
export {
  createWorkspace,
  MAX_HISTORY_ENTRIES,
  scopeKey,
  selectWorkspace,
  useSqlWorkbenchStore,
};
