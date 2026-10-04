"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";
import { useSidebar } from "@/components/querylane-ui/sidebar";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { sampleStatement } from "@/features/sql-workbench/sql-catalog-model";
import { SqlCatalogRail } from "@/features/sql-workbench/sql-catalog-rail";
import { SqlEditor } from "@/features/sql-workbench/sql-editor";
import type { SqlEditorHandle } from "@/features/sql-workbench/sql-editor-types";
import { SqlHistorySheet } from "@/features/sql-workbench/sql-history-sheet";
import {
  DEFAULT_SCHEMA,
  type SqlRelation,
} from "@/features/sql-workbench/sql-relation";
import { SqlResultsPane } from "@/features/sql-workbench/sql-results-pane";
import type { ResultsTab } from "@/features/sql-workbench/sql-results-tab";
import {
  DEFAULT_ROW_LIMIT,
  type RowLimit,
} from "@/features/sql-workbench/sql-row-limit";
import { SqlSaveQueryDialog } from "@/features/sql-workbench/sql-save-query-dialog";
import { SqlSchemaSelect } from "@/features/sql-workbench/sql-schema-select";
import {
  resolveRunnableStatements,
  type SqlStatement,
  splitSqlStatements,
} from "@/features/sql-workbench/sql-statements";
import { SqlTabStrip } from "@/features/sql-workbench/sql-tab-strip";
import { summarizeStatement } from "@/features/sql-workbench/sql-workbench-format";
import {
  type SqlTab,
  scopeKey,
  useSqlWorkbenchStore,
} from "@/features/sql-workbench/sql-workbench-store";
import { SqlWorkbenchToolbar } from "@/features/sql-workbench/sql-workbench-toolbar";
import { useSqlCompletionNamespace } from "@/features/sql-workbench/use-sql-completion-namespace";
import { useSqlExecution } from "@/features/sql-workbench/use-sql-execution";
import { useSqlValidator } from "@/features/sql-workbench/use-sql-validation";
import { ExplorerSidebarPortal } from "@/lib/explorer-sidebar-slot";

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
  // Keyed by scope so switching databases unmounts the workbench: in-flight
  // queries abort with it instead of settling into the next database's history.
  return (
    <SqlWorkbench
      activeTab={activeTab}
      databaseId={databaseId}
      instanceId={instanceId}
      key={scope}
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
  function currentStatements(): SqlStatement[] {
    const target = editorRef.current?.getRunTarget();
    if (!target) {
      return [];
    }
    const statements = resolveRunnableStatements(target);
    if (statements.length === 0) {
      toast.info("Nothing to run", {
        description: "Place the cursor inside a statement or select one.",
      });
    }
    return statements;
  }

  async function formatCurrent() {
    // sql-formatter is only needed once someone formats, so it loads then.
    // The text is read after the import so typing during the load is kept.
    let formatSqlText: typeof import("@/features/sql-workbench/sql-format").formatSqlText;
    try {
      ({ formatSqlText } = await import("@/features/sql-workbench/sql-format"));
    } catch {
      toast.error("Could not load the formatter", {
        description: "Check your connection and try formatting again.",
      });
      return;
    }
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

  return { currentStatements, formatCurrent };
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
  const history = useSqlWorkbenchStore(
    (state) => state.history[scope] ?? NO_ENTRIES
  );
  const savedQueries = useSqlWorkbenchStore(
    (state) => state.savedQueries[scope] ?? NO_ENTRIES
  );
  const store = useSqlWorkbenchStore(
    useShallow((state) => ({
      addTab: state.addTab,
      clearHistory: state.clearHistory,
      closeTab: state.closeTab,
      deleteSavedQuery: state.deleteSavedQuery,
      openSavedQuery: state.openSavedQuery,
      recordHistory: state.recordHistory,
      saveQuery: state.saveQuery,
      setActiveTab: state.setActiveTab,
      updateTabSchema: state.updateTabSchema,
      updateTabText: state.updateTabText,
    }))
  );
  const editorRef = useRef<SqlEditorHandle>(null);
  const [rowLimit, setRowLimit] = useState<RowLimit>(DEFAULT_ROW_LIMIT);
  const [resultsTab, setResultsTab] = useState<ResultsTab>("results");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const { isMobile, setOpenMobile } = useSidebar();
  const execution = useSqlExecution({
    databaseId,
    instanceId,
    onSettled: (event) => store.recordHistory(scope, event),
  });
  const { namespace: schema, scope: completionScope } =
    useSqlCompletionNamespace({
      databaseId,
      defaultSchema: activeTab.defaultSchema,
      instanceId,
      text: activeTab.text,
    });
  const validate = useSqlValidator({
    databaseId,
    defaultSchema: activeTab.defaultSchema,
    instanceId,
  });
  const { currentStatements, formatCurrent } = useWorkbenchEditorActions({
    editorRef,
  });
  const activeExecution = execution.executions[activeTab.id];
  const activeExplain = execution.explains[activeTab.id];
  const isRunning = activeExecution?.status === "running";
  const isExplaining = activeExplain?.status === "running";
  const statements = splitSqlStatements(activeTab.text);
  const runningTabIds = new Set(
    Object.entries(execution.executions).flatMap(([tabId, state]) =>
      state.status === "running" ? [tabId] : []
    )
  );

  function runCurrent(): Promise<unknown> | undefined {
    if (isRunning) {
      return;
    }
    const pending = currentStatements();
    if (pending.length === 0) {
      return;
    }
    setResultsTab("results");
    return runSequence(pending);
  }

  async function runSequence(pending: readonly SqlStatement[]): Promise<void> {
    const [next, ...rest] = pending;
    if (!next) {
      return;
    }
    const status = await execution.run(activeTab.id, next.text, {
      defaultSchema: activeTab.defaultSchema,
      rowLimit,
    });
    if (status === "success") {
      await runSequence(rest);
    }
  }

  function runAll() {
    if (isRunning || statements.length === 0) {
      return;
    }
    setResultsTab("results");
    runSequence(statements);
  }

  /** Re-runs the statement that failed, not whatever is under the cursor now. */
  function retryActiveExecution() {
    if (!activeExecution) {
      return runCurrent();
    }
    return execution.run(activeTab.id, activeExecution.statement, {
      defaultSchema: activeTab.defaultSchema,
      rowLimit: activeExecution.rowLimit,
    });
  }

  function explain(analyze: boolean) {
    const pending = currentStatements();
    if (pending.length > 1) {
      toast.info("Explain one statement at a time", {
        description: "Select a single statement, or place the cursor in one.",
      });
      return;
    }
    const statement = pending[0]?.text;
    if (statement) {
      setResultsTab("plan");
      execution.explain(activeTab.id, statement, {
        analyze,
        defaultSchema: activeTab.defaultSchema,
      });
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

  // On phones the rail is a sheet; close it after a pick so the editor or the
  // fresh results are visible immediately.
  function closeMobileRail() {
    if (isMobile) {
      setOpenMobile(false);
    }
  }

  function insertFromCatalog(text: string) {
    editorRef.current?.insertText(text);
    closeMobileRail();
  }

  function queryRelation(relation: SqlRelation) {
    // The new tab has no default schema, so names resolve as in `public`.
    const statement = sampleStatement(relation);
    const tabId = store.addTab(scope, {
      text: statement,
      title: relation.name,
    });
    setResultsTab("results");
    execution.run(tabId, statement, { rowLimit });
    closeMobileRail();
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
      <ExplorerSidebarPortal>
        <SqlCatalogRail
          databaseId={databaseId}
          defaultSchema={activeTab.defaultSchema ?? DEFAULT_SCHEMA}
          instanceId={instanceId}
          onInsert={insertFromCatalog}
          onQueryRelation={queryRelation}
        />
      </ExplorerSidebarPortal>
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
        onCancelExplain={() => execution.cancelExplain(activeTab.id)}
        onExplain={explain}
        onFormat={formatCurrent}
        onOpenHistory={() => setHistoryOpen(true)}
        onRowLimitChange={setRowLimit}
        onRun={runCurrent}
        onRunAll={runAll}
        onSave={() => setSaveOpen(true)}
        rowLimit={rowLimit}
        schemaSelect={
          <SqlSchemaSelect
            databaseId={databaseId}
            instanceId={instanceId}
            onChange={(next) =>
              store.updateTabSchema(scope, activeTab.id, next)
            }
            value={activeTab.defaultSchema}
          />
        }
        statementCount={statements.length}
      />
      <ResizablePanelGroup className="min-h-0 flex-1" orientation="vertical">
        <ResizablePanel defaultSize="42" minSize="15">
          <div className="flex h-full min-h-0 flex-col">
            <SqlEditor
              ariaLabel={`SQL editor, ${activeTab.title}`}
              completionScope={completionScope}
              defaultSchema={activeTab.defaultSchema}
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
              validate={validate}
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
            onRetry={retryActiveExecution}
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
