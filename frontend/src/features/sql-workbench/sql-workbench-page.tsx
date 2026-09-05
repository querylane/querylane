"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { SqlEditor } from "@/features/sql-workbench/sql-editor";
import type { SqlEditorHandle } from "@/features/sql-workbench/sql-editor-types";
import { SqlHistorySheet } from "@/features/sql-workbench/sql-history-sheet";
import { SqlResultsPane } from "@/features/sql-workbench/sql-results-pane";
import type { ResultsTab } from "@/features/sql-workbench/sql-results-tab";
import {
  DEFAULT_ROW_LIMIT,
  type RowLimit,
} from "@/features/sql-workbench/sql-row-limit";
import { SqlSaveQueryDialog } from "@/features/sql-workbench/sql-save-query-dialog";
import {
  resolveRunnableStatement,
  type SqlStatement,
  splitSqlStatements,
} from "@/features/sql-workbench/sql-statements";
import { SqlTabStrip } from "@/features/sql-workbench/sql-tab-strip";
import {
  formatSqlText,
  summarizeStatement,
} from "@/features/sql-workbench/sql-workbench-format";
import {
  type SqlTab,
  scopeKey,
  useSqlWorkbenchStore,
} from "@/features/sql-workbench/sql-workbench-store";
import { SqlWorkbenchToolbar } from "@/features/sql-workbench/sql-workbench-toolbar";
import { useSqlCompletionNamespace } from "@/features/sql-workbench/use-sql-completion-namespace";
import { useSqlExecution } from "@/features/sql-workbench/use-sql-execution";

const EDITOR_PLACEHOLDER =
  "-- Read-only SQL against this database. ⌘/Ctrl + Enter runs the statement under the cursor.";
const SAVED_NAME_MAX_LENGTH = 60;
const NO_ENTRIES: never[] = [];

function SqlWorkbenchPage({
  databaseId,
  instanceId,
}: {
  databaseId: string;
  instanceId: string;
}) {
  const scope = scopeKey(instanceId, databaseId);
  const workspace = useSqlWorkbenchStore((state) => state.workspaces[scope]);
  const ensureWorkspace = useSqlWorkbenchStore(
    (state) => state.ensureWorkspace
  );

  useEffect(
    function materializeWorkspace() {
      ensureWorkspace(scope);
    },
    [ensureWorkspace, scope]
  );

  const activeTab = workspace?.tabs.find(
    (tab) => tab.id === workspace.activeTabId
  );
  if (!(workspace && activeTab)) {
    return <div aria-busy="true" className="flex-1" />;
  }
  return (
    <SqlWorkbench
      activeTab={activeTab}
      databaseId={databaseId}
      instanceId={instanceId}
      scope={scope}
      tabs={workspace.tabs}
    />
  );
}

function useWorkbenchEditorActions({
  editorRef,
}: {
  editorRef: React.RefObject<SqlEditorHandle | null>;
}) {
  function currentStatement(): string | null {
    const target = editorRef.current?.getRunTarget();
    if (!target) {
      return null;
    }
    const statement = resolveRunnableStatement(target);
    if (!statement) {
      toast.info("Nothing to run", {
        description: "Place the cursor inside a statement or select one.",
      });
      return null;
    }
    return statement.text;
  }

  function formatCurrent() {
    const target = editorRef.current?.getRunTarget();
    if (!target || target.text.trim() === "") {
      return;
    }
    const formatted = formatSqlText(target.text);
    if (!formatted.ok) {
      toast.error("Could not format", {
        description:
          "The statement uses syntax the formatter does not understand.",
      });
      return;
    }
    editorRef.current?.replaceText(formatted.text);
  }

  return { currentStatement, formatCurrent };
}

function SqlWorkbench({
  activeTab,
  databaseId,
  instanceId,
  scope,
  tabs,
}: {
  activeTab: SqlTab;
  databaseId: string;
  instanceId: string;
  scope: string;
  tabs: SqlTab[];
}) {
  const store = useSqlWorkbenchStore();
  const history = store.history[scope] ?? NO_ENTRIES;
  const savedQueries = store.savedQueries[scope] ?? NO_ENTRIES;
  const editorRef = useRef<SqlEditorHandle>(null);
  const [rowLimit, setRowLimit] = useState<RowLimit>(DEFAULT_ROW_LIMIT);
  const [resultsTab, setResultsTab] = useState<ResultsTab>("results");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const execution = useSqlExecution({
    databaseId,
    instanceId,
    onSettled: (event) => store.recordHistory(scope, event),
  });
  const schema = useSqlCompletionNamespace({
    databaseId,
    instanceId,
    text: activeTab.text,
  });
  const { currentStatement, formatCurrent } = useWorkbenchEditorActions({
    editorRef,
  });
  const activeExecution = execution.executions[activeTab.id];
  const activeExplain = execution.explains[activeTab.id];
  const isRunning = activeExecution?.status === "running";
  const isExplaining = activeExplain?.status === "running";
  const statements = splitSqlStatements(activeTab.text);
  const runningTabIds = new Set(
    Object.entries(execution.executions)
      .filter(([, state]) => state.status === "running")
      .map(([tabId]) => tabId)
  );

  function runCurrent(): Promise<unknown> | undefined {
    if (isRunning) {
      return;
    }
    const statement = currentStatement();
    if (!statement) {
      return;
    }
    setResultsTab("results");
    return execution.run(activeTab.id, statement, { rowLimit });
  }

  async function runSequence(pending: readonly SqlStatement[]): Promise<void> {
    const [next, ...rest] = pending;
    if (!next) {
      return;
    }
    const status = await execution.run(activeTab.id, next.text, { rowLimit });
    if (status === "success") {
      await runSequence(rest);
    }
  }

  function runAll() {
    if (isRunning || statements.length === 0) {
      return;
    }
    setResultsTab("results");
    runSequence(statements).catch(() => undefined);
  }

  function explain(analyze: boolean) {
    const statement = currentStatement();
    if (statement) {
      setResultsTab("plan");
      execution
        .explain(activeTab.id, statement, { analyze })
        .catch(() => undefined);
    }
  }

  function openStatementInNewTab(statement: string) {
    store.addTab(scope, { text: statement });
    setHistoryOpen(false);
  }

  function openSaved(id: string) {
    store.openSavedQuery(scope, id);
    setHistoryOpen(false);
  }

  function saveActiveTab(name: string) {
    store.saveQuery(scope, {
      name,
      statement: activeTab.text,
      tabId: activeTab.id,
    });
    setSaveOpen(false);
    toast.success("Query saved", { description: name });
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <SqlTabStrip
        activeTabId={activeTab.id}
        onAdd={() => store.addTab(scope)}
        onClose={(tabId) => {
          execution.clear(tabId);
          store.closeTab(scope, tabId);
        }}
        onSelect={(tabId) => store.setActiveTab(scope, tabId)}
        runningTabIds={runningTabIds}
        tabs={tabs}
      />
      <SqlWorkbenchToolbar
        canRun={activeTab.text.trim().length > 0}
        historyCount={history.length}
        isExplaining={isExplaining}
        isRunning={isRunning}
        onCancel={() => execution.cancel(activeTab.id)}
        onExplain={explain}
        onFormat={formatCurrent}
        onOpenHistory={() => setHistoryOpen(true)}
        onRowLimitChange={setRowLimit}
        onRun={runCurrent}
        onRunAll={runAll}
        onSave={() => setSaveOpen(true)}
        rowLimit={rowLimit}
        statementCount={statements.length}
      />
      <ResizablePanelGroup className="min-h-0 flex-1" orientation="vertical">
        <ResizablePanel defaultSize="42" minSize="15">
          <div className="flex h-full min-h-0 flex-col">
            <SqlEditor
              ariaLabel={`SQL editor, ${activeTab.title}`}
              key={activeTab.id}
              onChange={(text) =>
                store.updateTabText(scope, activeTab.id, text)
              }
              onFormat={formatCurrent}
              onRunAll={runAll}
              onRunCurrent={runCurrent}
              placeholder={EDITOR_PLACEHOLDER}
              ref={editorRef}
              schema={schema}
              value={activeTab.text}
            />
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle={true} />
        <ResizablePanel defaultSize="58" minSize="20">
          <SqlResultsPane
            activeTab={resultsTab}
            execution={activeExecution}
            explain={activeExplain}
            onRetry={runCurrent}
            onTabChange={setResultsTab}
          />
        </ResizablePanel>
      </ResizablePanelGroup>
      <SqlHistorySheet
        history={history}
        onClearHistory={() => store.clearHistory(scope)}
        onDeleteSaved={(id) => store.deleteSavedQuery(scope, id)}
        onOpenChange={setHistoryOpen}
        onOpenHistoryEntry={openStatementInNewTab}
        onOpenSaved={openSaved}
        open={historyOpen}
        savedQueries={savedQueries}
      />
      {saveOpen ? (
        <SqlSaveQueryDialog
          defaultName={summarizeStatement(
            activeTab.text,
            SAVED_NAME_MAX_LENGTH
          )}
          onOpenChange={setSaveOpen}
          onSave={saveActiveTab}
          open={saveOpen}
          statement={activeTab.text}
        />
      ) : null}
    </div>
  );
}

export { SqlWorkbenchPage };
