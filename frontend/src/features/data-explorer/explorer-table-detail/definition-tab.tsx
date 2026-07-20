import { Layers, type LucideIcon, RefreshCw, Terminal } from "lucide-react";
import { useEffect } from "react";
import { BashSyntaxHighlight } from "@/components/querylane-ui/bash-syntax-highlight";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { CopyIconButton } from "@/components/ui/copy-icon-button";
import { SqlCodeBlock } from "@/components/ui/sql-code-block";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  type DefinitionSection,
  deriveDefinitionSections,
  formatQualifiedTableName,
} from "@/features/data-explorer/explorer-table-detail/definition-model";
import {
  formatColumnList,
  formatReferencedTable,
} from "@/features/data-explorer/explorer-table-detail/keys-model";
import { deriveMetadataToolbar } from "@/features/data-explorer/explorer-table-detail/metadata";
import {
  TabError,
  TabSkeleton,
} from "@/features/data-explorer/explorer-table-detail/shared-ui";
import { collectQueryErrors } from "@/features/data-explorer/table-detail-query-state";
import type {
  useGetTablePartitionMetadataQuery,
  useListTableColumnsQuery,
  useListTableConstraintsQuery,
  useListTableIndexesQuery,
  useListTablePoliciesQuery,
  useListTableTriggersQuery,
} from "@/hooks/api/table";
import { useMinimumSpin } from "@/hooks/use-minimum-spin";
import { cn } from "@/lib/utils";
import type {
  Table_TableType,
  TableConstraint,
} from "@/protogen/querylane/console/v1alpha1/table_pb";

function DefinitionSectionCard({ section }: { section: DefinitionSection }) {
  return (
    <Card className="min-w-0 gap-0 py-0" size="sm">
      <CardHeader className="border-b bg-muted/40 py-3">
        <h2 className="flex items-center gap-2 font-medium text-sm">
          {section.title}
        </h2>
        <CardDescription className="font-mono text-xs">
          {section.detail}
        </CardDescription>
      </CardHeader>
      {section.kind === "code" ? (
        <SqlCodeBlock
          className="rounded-none rounded-b-xl border-0 bg-muted/30 p-4 pr-10 text-[12px]"
          sql={section.content}
        />
      ) : (
        <CardContent className="py-4 text-muted-foreground text-sm leading-relaxed">
          {section.content}
        </CardContent>
      )}
    </Card>
  );
}

function DefinitionSideCard({
  action,
  children,
  icon: Icon,
  title,
}: {
  action?: React.ReactNode;
  children: React.ReactNode;
  icon: LucideIcon;
  title: string;
}) {
  return (
    <Card className="min-w-0 gap-0 py-0" size="sm">
      <CardHeader className="border-b bg-muted/40 py-3">
        <h2 className="flex items-center gap-2 font-medium text-sm">
          <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
          {title}
        </h2>
        {action ? <CardAction>{action}</CardAction> : null}
      </CardHeader>
      <CardContent className="py-3">{children}</CardContent>
    </Card>
  );
}

function dependencyReferences(constraints: TableConstraint[]) {
  return constraints.flatMap((constraint) => {
    if (!constraint.referencedTable) {
      return [];
    }
    const target = formatReferencedTable(constraint.referencedTable);
    const sourceColumns = formatColumnList(constraint.columnNames);
    const targetColumns = formatColumnList(constraint.referencedColumnNames);
    return [
      `${sourceColumns} → ${target}${
        targetColumns === "—" ? "" : `(${targetColumns})`
      }`,
    ];
  });
}

function ReferencedTablesCard({ references }: { references: string[] }) {
  return (
    <Card className="min-w-0 gap-0 py-0" size="sm">
      <CardHeader className={cn("py-3", references.length > 0 && "border-b")}>
        <h2 className="flex items-center gap-2 font-medium text-sm">
          <Layers aria-hidden="true" className="size-4 text-muted-foreground" />
          Referenced tables
        </h2>
        <CardDescription>
          {references.length > 0
            ? `${references.length.toLocaleString()} outbound ${references.length === 1 ? "reference" : "references"}`
            : "No referenced tables"}
        </CardDescription>
      </CardHeader>
      {references.length > 0 ? (
        <CardContent className="py-3">
          <ul className="space-y-1">
            {references.map((reference) => (
              <li className="font-mono text-xs" key={reference}>
                {reference}
              </li>
            ))}
          </ul>
        </CardContent>
      ) : null}
    </Card>
  );
}

function dumpCommand({
  databaseId,
  qualifiedTableName,
  tableName,
}: {
  databaseId: string;
  qualifiedTableName: string;
  tableName: string;
}) {
  return [
    'pg_dump -h "$POSTGRES_HOST" \\',
    `  -U "$POSTGRES_ROLE" -d "\${DATABASE_NAME:-${shellDoubleQuoteEscape(databaseId)}}" \\`,
    "  --schema-only --no-owner --no-privileges \\",
    `  --table=${shellSingleQuote(qualifiedTableName)} > ${shellSingleQuote(
      `${tableName}.sql`
    )}`,
  ].join("\n");
}

function DefinitionCommandStep({
  command,
  number,
  title,
}: {
  command: string;
  number: number;
  title: string;
}) {
  return (
    <div className="min-w-0 max-w-full overflow-hidden rounded-lg border">
      <div className="flex items-center gap-2 border-b bg-muted/60 px-3 py-2">
        <span className="flex size-5 items-center justify-center rounded-full bg-muted-foreground/20 font-mono text-[10px]">
          {number}
        </span>
        <h3 className="font-medium text-xs">{title}</h3>
        <CopyIconButton
          ariaLabel={`Copy ${title.toLowerCase()} command`}
          className="ml-auto"
          value={command}
        />
      </div>
      <section
        aria-label={`${title} command`}
        className="max-w-full overflow-x-auto focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        <pre className="min-h-14 w-max min-w-full whitespace-pre bg-transparent p-3 font-mono text-xs leading-relaxed">
          <BashSyntaxHighlight code={command} />
        </pre>
      </section>
    </div>
  );
}

function ReproduceLocallyCard({
  command,
  databaseId,
  schemaName,
  tableName,
}: {
  command: string;
  databaseId: string;
  schemaName: string;
  tableName: string;
}) {
  const createDatabaseCommand = `createdb -h localhost "\${DATABASE_NAME:-${shellDoubleQuoteEscape(databaseId)}}"`;
  const restoreCommand = [
    `psql -h localhost -d "\${DATABASE_NAME:-${shellDoubleQuoteEscape(databaseId)}}" \\`,
    `  -f ${shellSingleQuote(`${tableName}.sql`)}`,
  ].join("\n");
  const allSteps = [
    "export POSTGRES_HOST='your-host'",
    "export POSTGRES_ROLE='your-role'",
    `export DATABASE_NAME=${shellSingleQuote(databaseId)}`,
    "",
    command,
    "",
    createDatabaseCommand,
    "",
    restoreCommand,
  ].join("\n");

  return (
    <DefinitionSideCard
      action={
        <CopyIconButton
          ariaLabel="Copy all steps"
          size="sm"
          value={allSteps}
          variant="outline"
        >
          Copy all steps
        </CopyIconButton>
      }
      icon={Terminal}
      title="Reproduce locally"
    >
      <div className="min-w-0 space-y-3">
        <Tabs defaultValue="table">
          <TabsList
            aria-label="Reproduction scope"
            className="grid w-full grid-cols-3"
          >
            <TabsTrigger className="min-w-0 truncate" value="table">
              {tableName}
            </TabsTrigger>
            <TabsTrigger className="min-w-0 truncate" value="schema">
              {schemaName}
            </TabsTrigger>
            <TabsTrigger className="min-w-0 truncate" value="database">
              {databaseId}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex min-h-8 items-center rounded-lg border bg-background px-3 py-1.5 text-sm">
          <span>Template: pg_dump, schema only (SQL)</span>
        </div>
        <DefinitionCommandStep
          command={command}
          number={1}
          title="Dump schema only"
        />
        <DefinitionCommandStep
          command={createDatabaseCommand}
          number={2}
          title="Create a local database"
        />
        <DefinitionCommandStep
          command={restoreCommand}
          number={3}
          title="Restore"
        />
        <Alert className="px-3 py-2">
          <AlertDescription className="text-[11px] leading-relaxed">
            Related foreign key targets are not included with --table; dump the
            schema scope if you need them.
          </AlertDescription>
        </Alert>
      </div>
    </DefinitionSideCard>
  );
}

function shellSingleQuote(value: string) {
  return `'${value.replaceAll("'", "'\"'\"'")}'`;
}

// For values interpolated inside a double-quoted shell word, where $, ", \
// and backticks keep their special meaning.
function shellDoubleQuoteEscape(value: string) {
  return value.replace(/([\\"$`])/g, "\\$1");
}

function DefinitionTab({
  columnsQuery,
  constraintsQuery,
  databaseId,
  indexesQuery,
  partitionMetadataQuery,
  policiesQuery,
  schemaName,
  tableComment,
  tableName,
  tableType,
  triggersQuery,
}: {
  columnsQuery: ReturnType<typeof useListTableColumnsQuery>;
  constraintsQuery: ReturnType<typeof useListTableConstraintsQuery>;
  databaseId: string;
  indexesQuery: ReturnType<typeof useListTableIndexesQuery>;
  partitionMetadataQuery: ReturnType<typeof useGetTablePartitionMetadataQuery>;
  policiesQuery: ReturnType<typeof useListTablePoliciesQuery>;
  schemaName: string;
  tableComment: string;
  tableName: string;
  tableType: Table_TableType;
  triggersQuery: ReturnType<typeof useListTableTriggersQuery>;
}) {
  useEffect(
    function refreshDefinitionOnOpen() {
      Promise.all([
        columnsQuery.refetch(),
        constraintsQuery.refetch(),
        indexesQuery.refetch(),
        partitionMetadataQuery.refetch(),
        policiesQuery.refetch(),
        triggersQuery.refetch(),
      ]);
    },
    [
      columnsQuery.refetch,
      constraintsQuery.refetch,
      indexesQuery.refetch,
      partitionMetadataQuery.refetch,
      policiesQuery.refetch,
      triggersQuery.refetch,
    ]
  );
  const toolbar = deriveMetadataToolbar([
    columnsQuery,
    constraintsQuery,
    indexesQuery,
    partitionMetadataQuery,
    policiesQuery,
    triggersQuery,
  ]);
  const isRefreshSpinning = useMinimumSpin(toolbar.isRefreshing);
  const errors = collectQueryErrors(
    {
      endpoint: "ListTableColumns",
      label: "Columns",
      query: columnsQuery,
    },
    {
      endpoint: "ListTableConstraints",
      label: "Constraints",
      query: constraintsQuery,
    },
    {
      endpoint: "ListTableIndexes",
      label: "Indexes",
      query: indexesQuery,
    },
    {
      endpoint: "GetTablePartitionMetadata",
      label: "Partitions",
      query: partitionMetadataQuery,
    },
    {
      endpoint: "ListTablePolicies",
      label: "Policies",
      query: policiesQuery,
    },
    {
      endpoint: "ListTableTriggers",
      label: "Triggers",
      query: triggersQuery,
    }
  );
  const blockingErrors = columnsQuery.data
    ? []
    : errors.filter((queryError) => queryError.label === "Columns");
  if (blockingErrors.length > 0) {
    return (
      <TabError
        errors={blockingErrors}
        onRetry={toolbar.handleRetry}
        tab="definition"
      />
    );
  }
  if (!columnsQuery.data || columnsQuery.isLoading) {
    return <TabSkeleton />;
  }

  const constraints = constraintsQuery.data?.constraints ?? [];
  const indexes = indexesQuery.data?.indexes ?? [];
  const policies = policiesQuery.data?.policies ?? [];
  const triggers = triggersQuery.data?.triggers ?? [];
  const qualifiedTableName = formatQualifiedTableName(schemaName, tableName);
  const sections = deriveDefinitionSections({
    columns: columnsQuery.data.columns,
    constraints,
    indexes,
    partitionMetadata: partitionMetadataQuery.data?.partitionMetadata,
    policies,
    qualifiedTableName,
    tableComment,
    tableType,
    triggers,
  });
  const references = dependencyReferences(constraints);
  const command = dumpCommand({
    databaseId,
    qualifiedTableName,
    tableName,
  });

  return (
    <div className="min-w-0 space-y-4">
      {errors.length > 0 ? (
        <TabError
          errors={errors}
          onRetry={toolbar.handleRetry}
          tab="definition"
        />
      ) : null}
      <div className="flex w-full min-w-0 flex-wrap items-center gap-2 text-muted-foreground text-sm">
        <span>Schema document</span>
        <span aria-hidden="true">·</span>
        <span>
          generated live from{" "}
          <code className="rounded bg-muted px-1 py-0.5">pg_catalog</code>
        </span>
        <span aria-hidden="true">·</span>
        <span>{toolbar.lastFetchedLabel}</span>
        <div className="ml-auto shrink-0">
          <Button
            disabled={toolbar.isRefreshing}
            onClick={toolbar.handleRefresh}
            size="sm"
            type="button"
            variant="outline"
          >
            <RefreshCw
              aria-hidden="true"
              className={cn(
                "size-3.5",
                isRefreshSpinning && "animate-spin motion-reduce:animate-none"
              )}
              data-icon="inline-start"
            />
            Refresh
          </Button>
        </div>
      </div>
      {sections.map((section) => (
        <DefinitionSectionCard key={section.id} section={section} />
      ))}
      <ReferencedTablesCard references={references} />
      <ReproduceLocallyCard
        command={command}
        databaseId={databaseId}
        schemaName={schemaName}
        tableName={tableName}
      />
      <p className="px-1 text-muted-foreground text-xs leading-relaxed">
        Definition is generated from pg_catalog on each visit; Querylane never
        stores or mutates schema.
      </p>
    </div>
  );
}

export { DefinitionTab };
