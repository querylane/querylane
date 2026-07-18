import { useState } from "react";
import {
  OBJECT_CATEGORIES,
  type OtherDatabaseObject,
  type OtherObjectCategory,
} from "@/components/console-pages/database-object-categories";
import {
  ExtensionRow,
  ObjectRow,
} from "@/components/console-pages/database-object-rows";
import {
  CategoryBrowseDialog,
  ExtensionsBrowseDialog,
} from "@/components/console-pages/database-objects-browse-dialog";
import {
  CardLoadingRows,
  Eyebrow,
} from "@/components/console-pages/database-overview-sections";
import {
  type OtherObjectsSummary,
  useOtherDatabaseObjectsSummaryQuery,
} from "@/components/console-pages/other-database-objects-query";
import { RetryActionButton } from "@/components/retry-action-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { Extension } from "@/protogen/querylane/console/v1alpha1/extension_pb";

interface DatabaseParams {
  databaseId: string;
  instanceId: string;
}

// ————————————————————————————————————————————————————————————————
// Category cards

function ViewAllButton({
  label,
  onOpen,
  total,
}: {
  label: string;
  onOpen: () => void;
  total: number;
}) {
  return (
    <Button
      aria-label={`View all ${total} ${label.toLowerCase()}`}
      className="mt-2 self-start text-muted-foreground"
      onClick={onOpen}
      size="xs"
      type="button"
      variant="ghost"
    >
      View all {total}
    </Button>
  );
}

function ObjectCategoryCard({
  category,
  label,
  objects,
  params,
  total,
}: {
  category: OtherObjectCategory;
  label: string;
  objects: OtherDatabaseObject[];
  params: DatabaseParams;
  total: number;
}) {
  const [isBrowseOpen, setIsBrowseOpen] = useState(false);
  return (
    <Card className="gap-4">
      <CardHeader>
        <Eyebrow right={String(total)}>{label}</Eyebrow>
      </CardHeader>
      <CardContent className="flex flex-col">
        {objects.map((object) => (
          <ObjectRow
            key={`${object.category}:${object.name}`}
            object={object}
          />
        ))}
        {total > objects.length ? (
          <ViewAllButton
            label={label}
            onOpen={() => setIsBrowseOpen(true)}
            total={total}
          />
        ) : null}
        {isBrowseOpen ? (
          <CategoryBrowseDialog
            category={category}
            databaseId={params.databaseId}
            instanceId={params.instanceId}
            label={label}
            onOpenChange={setIsBrowseOpen}
            open={isBrowseOpen}
            total={total}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

const EXTENSIONS_ROW_LIMIT = 5;

function ExtensionsCard({
  extensions,
  isPending,
}: {
  extensions: Extension[];
  isPending: boolean;
}) {
  const [isBrowseOpen, setIsBrowseOpen] = useState(false);
  const installed = extensions.filter((extension) => extension.installed);
  const visible = installed.slice(0, EXTENSIONS_ROW_LIMIT);
  const emptyText =
    installed.length === 0 && !isPending
      ? "No extensions are installed in this database."
      : null;
  return (
    <Card className="gap-4">
      <CardHeader>
        <Eyebrow right={isPending ? undefined : String(installed.length)}>
          Extensions
        </Eyebrow>
      </CardHeader>
      <CardContent className="flex flex-col">
        {isPending ? <CardLoadingRows label="Loading extensions" /> : null}
        {emptyText ? (
          <p className="py-2 text-[13px] text-muted-foreground">{emptyText}</p>
        ) : null}
        {visible.map((extension) => (
          <ExtensionRow extension={extension} key={extension.name} />
        ))}
        {installed.length > visible.length ? (
          <ViewAllButton
            label="Extensions"
            onOpen={() => setIsBrowseOpen(true)}
            total={installed.length}
          />
        ) : null}
        {isBrowseOpen ? (
          <ExtensionsBrowseDialog
            extensions={installed}
            onOpenChange={setIsBrowseOpen}
            open={isBrowseOpen}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

// ————————————————————————————————————————————————————————————————
// Section

interface DatabaseObjectsPanelProps {
  error?: unknown;
  extensions: Extension[];
  extensionsPending: boolean;
  isLoading: boolean;
  onRetry?: (() => Promise<unknown>) | undefined;
  params: DatabaseParams;
  summary: OtherObjectsSummary;
}

function ObjectsErrorCard({
  onRetry,
}: {
  onRetry?: (() => Promise<unknown>) | undefined;
}) {
  return (
    <Card className="gap-4">
      <CardHeader>
        <Eyebrow>Other objects</Eyebrow>
      </CardHeader>
      <CardContent className="flex flex-col items-start gap-3">
        <p className="text-[13px] text-muted-foreground">
          Failed to load other database objects.
        </p>
        {onRetry ? (
          <RetryActionButton
            label="Retry"
            onRetry={onRetry}
            size="xs"
            variant="outline"
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

function ObjectsLoadingCard() {
  return (
    <Card className="gap-4">
      <CardHeader>
        <Eyebrow>Other objects</Eyebrow>
      </CardHeader>
      <CardContent>
        <CardLoadingRows label="Loading other database objects" />
      </CardContent>
    </Card>
  );
}

function CategoryCards({
  error,
  isLoading,
  params,
  summary,
  onRetry,
}: {
  error: unknown;
  isLoading: boolean;
  onRetry?: (() => Promise<unknown>) | undefined;
  params: DatabaseParams;
  summary: OtherObjectsSummary;
}) {
  if (error) {
    return <ObjectsErrorCard onRetry={onRetry} />;
  }
  if (isLoading) {
    return <ObjectsLoadingCard />;
  }
  return (
    <>
      {OBJECT_CATEGORIES.map((category) => {
        const categorySummary = summary[category.key];
        if (!categorySummary || categorySummary.total === 0) {
          return null;
        }
        return (
          <ObjectCategoryCard
            category={category.key}
            key={category.key}
            label={category.label}
            objects={categorySummary.objects}
            params={params}
            total={categorySummary.total}
          />
        );
      })}
    </>
  );
}

function DatabaseObjectsPanel({
  error,
  extensions,
  extensionsPending,
  isLoading,
  onRetry,
  params,
  summary,
}: DatabaseObjectsPanelProps) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <h2 className="font-semibold text-foreground text-sm">
          Database objects
        </h2>
        <p className="text-muted-foreground text-xs">
          Scoped to this database; roles and tablespaces live at the instance
          level.
        </p>
      </div>
      <div className="grid items-start gap-5 md:grid-cols-2 xl:grid-cols-3">
        <ExtensionsCard extensions={extensions} isPending={extensionsPending} />
        <CategoryCards
          error={error}
          isLoading={isLoading}
          onRetry={onRetry}
          params={params}
          summary={summary}
        />
      </div>
    </section>
  );
}

function DatabaseObjectsSection({
  databaseId,
  extensions,
  extensionsPending,
  instanceId,
}: {
  databaseId: string;
  extensions: Extension[];
  extensionsPending: boolean;
  instanceId: string;
}) {
  const query = useOtherDatabaseObjectsSummaryQuery({ databaseId, instanceId });

  return (
    <DatabaseObjectsPanel
      error={query.error}
      extensions={extensions}
      extensionsPending={extensionsPending}
      isLoading={query.isLoading}
      onRetry={() => query.refetch()}
      params={{ databaseId, instanceId }}
      summary={query.data ?? {}}
    />
  );
}

export { DatabaseObjectsPanel, DatabaseObjectsSection };
