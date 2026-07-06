"use client";

import { Eye } from "lucide-react";
import { useState } from "react";
import { EmptyStatePanel } from "@/components/empty-state-panel";
import { SqlNotices } from "@/components/sql/sql-notices";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SqlCodeBlock } from "@/components/ui/sql-code-block";
import { HeaderStat } from "@/features/data-explorer/explorer-shared-ui";
import {
  databaseResourceNameFromView,
  formatViewSqlIdentifier,
  queryShapeFromDefinition,
  runnableViewDefinition,
  sourceRelationsFromDefinition,
} from "@/features/data-explorer/explorer-view-detail-model";
import { formatRows } from "@/features/data-explorer/format-rows";
import { viewTypeLabel } from "@/features/data-explorer/view-type-label";
import { useExplainQuery } from "@/hooks/api/sql";
import {
  formatBytes,
  formatTimestampLabel,
  normalizeEstimatedRowCount,
} from "@/lib/console-resources";
import { ExplainQueryRequest_Format } from "@/protogen/querylane/console/v1alpha1/sql_pb";
import {
  type View,
  View_ViewType,
} from "@/protogen/querylane/console/v1alpha1/view_pb";

function PurposeCard({ view }: { view: View }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle aria-level={2} role="heading">
          Purpose
        </CardTitle>
        <CardDescription>Catalog comment for this view.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm">
          {view.comment ||
            "No comment is saved for this view. Use the SQL definition below to understand its intent."}
        </p>
      </CardContent>
    </Card>
  );
}

function SourceRelationsCard({ definition }: { definition: string }) {
  const sources = sourceRelationsFromDefinition(definition);
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle aria-level={2} role="heading">
          Source relations
        </CardTitle>
        <CardDescription>
          Relations referenced by FROM and JOIN.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {sources.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {sources.map((source) => (
              <Badge key={source} variant="secondary">
                {source}
              </Badge>
            ))}
          </div>
        ) : (
          <EmptyStatePanel className="min-h-24 rounded-md px-4 py-6" icon={Eye}>
            No source relations could be inferred from the definition.
          </EmptyStatePanel>
        )}
      </CardContent>
    </Card>
  );
}

function QueryShapeCard({ definition }: { definition: string }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle aria-level={2} role="heading">
          Query shape
        </CardTitle>
        <CardDescription>What this view does to matching rows.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {queryShapeFromDefinition(definition).map((label) => (
            <Badge key={label} variant="outline">
              {label}
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function DefinitionCard({ definition }: { definition: string }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle aria-level={2} role="heading">
          SQL definition
        </CardTitle>
        <CardDescription>
          Copy-pasteable SQL for recreating the view definition.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {definition ? (
          <SqlCodeBlock sql={definition} />
        ) : (
          <p className="text-muted-foreground text-sm">
            Full SQL definition was not returned for this view.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function hasVisibleSqlNotice(notices: readonly string[]) {
  return notices.some((notice) => notice.trim().length > 0);
}

function ViewNoticeCheck({ view, viewName }: { view: View; viewName: string }) {
  const [enabled, setEnabled] = useState(false);
  const parent = databaseResourceNameFromView(view);
  const statement = `SELECT * FROM ${formatViewSqlIdentifier(view, viewName)}`;
  const noticesQuery = useExplainQuery(
    {
      format: ExplainQueryRequest_Format.TEXT,
      parent,
      statement,
    },
    {
      enabled,
      refetchOnWindowFocus: false,
      retry: false,
    }
  );
  const notices = noticesQuery.data?.notices ?? [];
  const hasVisibleNotices = hasVisibleSqlNotice(notices);

  if (!parent) {
    return null;
  }

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">Database notices</p>
          <p className="text-muted-foreground">
            Run a read-only view plan check and show PostgreSQL notices returned
            by the SQL service.
          </p>
        </div>
        <Button
          disabled={noticesQuery.isFetching}
          onClick={() => {
            if (enabled) {
              noticesQuery.refetch();
              return;
            }
            setEnabled(true);
          }}
          type="button"
          variant="outline"
        >
          {enabled ? "Refresh database notices" : "Check database notices"}
        </Button>
      </div>
      {enabled && noticesQuery.error ? (
        <Alert variant="destructive">
          <AlertTitle>Could not check database notices</AlertTitle>
          <AlertDescription>
            Querylane could not fetch planner notices for this view.
          </AlertDescription>
        </Alert>
      ) : null}
      {enabled &&
      !noticesQuery.error &&
      !noticesQuery.isFetching &&
      !hasVisibleNotices ? (
        <p className="text-muted-foreground">No database notices returned.</p>
      ) : null}
      {enabled ? (
        <SqlNotices notices={notices} title="Returned notices" />
      ) : null}
    </div>
  );
}

function ViewDetail({
  view,
  viewName,
}: {
  view: View | undefined;
  viewName: string;
}) {
  const definition = view?.definition.trim() ?? "";
  const copyableDefinition = view
    ? runnableViewDefinition({ definition, view, viewName })
    : "";
  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
            <Eye className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider">
              {viewTypeLabel(view)}
            </p>
            <h1 className="truncate font-mono font-semibold text-xl">
              {viewName}
            </h1>
            {view?.owner ? (
              <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                owner: {view.owner}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-5">
          {view?.viewType === View_ViewType.MATERIALIZED ? (
            <>
              <HeaderStat
                label="Rows"
                value={formatRows(normalizeEstimatedRowCount(view.rowCount))}
              />
              <HeaderStat label="Size" value={formatBytes(view.sizeBytes)} />
              <HeaderStat
                label="Populated"
                value={view.isPopulated ? "Yes" : "No"}
              />
            </>
          ) : null}
          <HeaderStat
            label="Last DDL"
            value={formatTimestampLabel(view?.lastDdlTime)}
          />
        </div>
      </header>

      {view ? (
        <>
          <div className="grid gap-3 xl:grid-cols-3">
            <PurposeCard view={view} />
            <SourceRelationsCard definition={definition} />
            <QueryShapeCard definition={definition} />
          </div>
          <DefinitionCard definition={copyableDefinition} />
          <ViewNoticeCheck view={view} viewName={viewName} />
        </>
      ) : null}
    </div>
  );
}

export { ViewDetail };
