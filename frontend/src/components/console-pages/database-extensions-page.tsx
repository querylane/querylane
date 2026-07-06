"use client";

import { PackageOpen, X } from "lucide-react";
import { useState } from "react";
import {
  PageHeader,
  ResourcePageState,
} from "@/components/console-pages/console-layout";
import {
  filterExtensionsByFacets,
  presentExtensionSchemaOptions,
  presentExtensionStatusOptions,
} from "@/components/console-pages/database-extensions-filters";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  type DataTableColumnDef,
  DataTableFilter,
  SortableHeader,
} from "@/components/ui/data-table";
import {
  DataTableFacetedFilter,
  type FacetedFilterOption,
} from "@/components/ui/data-table-faceted-filter";
import {
  extensionsForDatabaseQueryInput,
  useListAllExtensionsQuery,
} from "@/hooks/api/extension";
import { useUrlTableSearch } from "@/lib/url-search-state";
import type { Extension } from "@/protogen/querylane/console/v1alpha1/extension_pb";

const EXTENSIONS_PAGE_SIZE = 20;

interface ExtensionFacetFilter {
  handleSelectedValuesChange: (values: string[]) => void;
  label: string;
  options: FacetedFilterOption[];
  selectedValues: string[];
}

function extensionColumns(): DataTableColumnDef<Extension>[] {
  return [
    {
      accessorFn: (row) => `${row.displayName} ${row.comment}`,
      cell: ({ row }) => (
        <span className="font-mono text-sm">{row.original.displayName}</span>
      ),
      header: ({ column }) => (
        <SortableHeader column={column}>Extension</SortableHeader>
      ),
      id: "extension",
    },
    {
      accessorFn: (row) => row.installed,
      cell: ({ row }) => (
        <Badge variant={row.original.installed ? "default" : "outline"}>
          {row.original.installed ? "Installed" : "Available"}
        </Badge>
      ),
      header: ({ column }) => (
        <SortableHeader column={column}>Status</SortableHeader>
      ),
      id: "status",
    },
    {
      accessorFn: (row) => row.schema,
      cell: ({ row }) => row.original.schema || "—",
      header: ({ column }) => (
        <SortableHeader column={column}>Schema</SortableHeader>
      ),
      id: "schema",
      meta: {
        cellClassName: "font-mono text-sm text-muted-foreground",
      },
    },
    {
      accessorFn: (row) => row.installedVersion,
      cell: ({ row }) => row.original.installedVersion || "—",
      header: ({ column }) => (
        <SortableHeader column={column}>Installed version</SortableHeader>
      ),
      id: "installedVersion",
      meta: {
        cellClassName: "font-mono text-sm text-muted-foreground",
      },
    },
    {
      accessorFn: (row) => row.defaultVersion,
      cell: ({ row }) => row.original.defaultVersion || "—",
      header: ({ column }) => (
        <SortableHeader column={column}>Default version</SortableHeader>
      ),
      id: "defaultVersion",
      meta: {
        cellClassName: "font-mono text-sm text-muted-foreground",
      },
    },
    {
      accessorFn: (row) => row.comment,
      cell: ({ row }) => row.original.comment || "—",
      enableSorting: false,
      header: () => "Description",
      id: "comment",
      meta: {
        cellClassName: "min-w-64 text-sm text-muted-foreground",
      },
    },
  ];
}

function ExtensionFilterBar({
  filters,
  onSearchChange,
  search,
}: {
  filters: ExtensionFacetFilter[];
  onSearchChange: (value: string) => void;
  search: string;
}) {
  const visibleFilters = filters.filter((filter) => filter.options.length > 0);
  const hasActiveFacet = visibleFilters.some(
    (filter) => filter.selectedValues.length > 0
  );

  return (
    <div
      className="flex min-w-0 flex-wrap items-center justify-start gap-2"
      data-slot="extension-filter-bar"
    >
      <DataTableFilter
        onChange={onSearchChange}
        placeholder="Search extensions..."
        value={search}
      />
      {visibleFilters.map((filter) => (
        <DataTableFacetedFilter
          key={filter.label}
          onSelectedValuesChange={filter.handleSelectedValuesChange}
          options={filter.options}
          selectedValues={filter.selectedValues}
          title={filter.label}
        />
      ))}
      {hasActiveFacet ? (
        <Button
          className="h-8 px-2 text-xs"
          onClick={() => {
            for (const filter of visibleFilters) {
              filter.handleSelectedValuesChange([]);
            }
          }}
          size="sm"
          type="button"
          variant="ghost"
        >
          <X data-icon="inline-start" />
          Reset
        </Button>
      ) : null}
    </div>
  );
}

function ExtensionsTable({ extensions }: { extensions: Extension[] }) {
  const [filter, setFilter] = useUrlTableSearch();
  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  const [schemaFilters, setSchemaFilters] = useState<string[]>([]);
  const filteredExtensions = filterExtensionsByFacets({
    extensions,
    schemaFilters,
    statusFilters,
  });
  const facetFilters = [
    {
      handleSelectedValuesChange: setStatusFilters,
      label: "Status",
      options: presentExtensionStatusOptions(extensions),
      selectedValues: statusFilters,
    },
    {
      handleSelectedValuesChange: setSchemaFilters,
      label: "Schema",
      options: presentExtensionSchemaOptions(extensions),
      selectedValues: schemaFilters,
    },
  ] satisfies ExtensionFacetFilter[];

  return (
    <div className="flex flex-col gap-3">
      <ExtensionFilterBar
        filters={facetFilters}
        onSearchChange={setFilter}
        search={filter}
      />
      <DataTable
        columns={extensionColumns()}
        data={filteredExtensions}
        emptyResourceName="extensions"
        filterColumn="extension"
        filterValue={filter}
        initialSorting={[
          { desc: true, id: "status" },
          { desc: false, id: "extension" },
        ]}
        onFilterChange={setFilter}
        pageSize={EXTENSIONS_PAGE_SIZE}
        tableKey="database-extensions"
      />
    </div>
  );
}

function NoExtensionsState() {
  return (
    <EmptyState
      description="The connected database did not report any available PostgreSQL extensions."
      icon={PackageOpen}
      title="No extensions found"
    />
  );
}

function BackendDatabaseExtensionsPage({
  databaseId,
  instanceId,
}: {
  databaseId: string;
  instanceId: string;
}) {
  const input = extensionsForDatabaseQueryInput({ databaseId, instanceId });
  const extensionsQuery = useListAllExtensionsQuery(input, {
    enabled: Boolean(instanceId && databaseId),
    refetchOnWindowFocus: false,
  });
  const extensions = extensionsQuery.data?.extensions ?? [];
  const hasData = extensionsQuery.data !== undefined;

  return (
    <ResourcePageState
      area="console.database.extensions"
      error={extensionsQuery.error}
      hasData={hasData}
      loading={extensionsQuery.isPending}
      retry={extensionsQuery.refetch}
      title="Loading extensions"
    >
      <div className="flex flex-col gap-6">
        <PageHeader
          description="Extensions are installed per database. Available means the server exposes the extension files, but this database has not installed it."
          eyebrow="Database"
          title="Extensions"
        />
        {extensions.length === 0 ? (
          <NoExtensionsState />
        ) : (
          <ExtensionsTable extensions={extensions} />
        )}
      </div>
    </ResourcePageState>
  );
}

export { BackendDatabaseExtensionsPage };
