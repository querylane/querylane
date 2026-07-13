"use client";

import { Check, Info, PackageOpen } from "lucide-react";
import { useState } from "react";
import {
  PageHeader,
  ResourcePageState,
} from "@/components/console-pages/console-layout";
import {
  type ExtensionCategoryFilter,
  type ExtensionFilterOption,
  type ExtensionScopeFilter,
  type ExtensionSourceFilter,
  type ExtensionStatusFilter,
  extensionFilterOptions,
  extensionInventorySummary,
  filterPresentedExtensions,
  type PresentedExtension,
  presentExtensions,
} from "@/components/console-pages/database-extensions-filters";
import { PaginationFooter } from "@/components/data-grid/table-data-grid/pagination-footer";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTableFilter } from "@/components/ui/data-table";
import { DataTableFacetedFilter } from "@/components/ui/data-table-faceted-filter";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { SqlCodeBlock } from "@/components/ui/sql-code-block";
import {
  extensionsForDatabaseQueryInput,
  useListAllExtensionsQuery,
} from "@/hooks/api/extension";
import { useUrlTableSearch } from "@/lib/url-search-state";
import type { Extension } from "@/protogen/querylane/console/v1alpha1/extension_pb";

const SMALL_EXTENSIONS_PAGE_SIZE = 6;
const MEDIUM_EXTENSIONS_PAGE_SIZE = 12;
const LARGE_EXTENSIONS_PAGE_SIZE = 24;
const DEFAULT_EXTENSIONS_PAGE_SIZE = SMALL_EXTENSIONS_PAGE_SIZE;
const EXTENSION_PAGE_SIZE_OPTIONS = [
  SMALL_EXTENSIONS_PAGE_SIZE,
  MEDIUM_EXTENSIONS_PAGE_SIZE,
  LARGE_EXTENSIONS_PAGE_SIZE,
] as const;

interface ExtensionFacetFilterProps<Value extends string> {
  label: string;
  onValueChange: (value: Value | "All") => void;
  options: ExtensionFilterOption<Value>[];
  value: Value | "All";
}

function ExtensionFacetFilter<Value extends string>({
  label,
  onValueChange,
  options,
  value,
}: ExtensionFacetFilterProps<Value>) {
  return (
    <DataTableFacetedFilter
      onSelectedValuesChange={(selectedValues) => {
        const selectedOption = options.find(
          (option) => option.value === selectedValues[0]
        );
        onValueChange(selectedOption?.value ?? "All");
      }}
      options={options}
      selectedValues={value === "All" ? [] : [value]}
      singleSelect={true}
      title={label}
    />
  );
}

function ExtensionFilterBar({
  category,
  categoryFilterOptions,
  onCategoryChange,
  onScopeChange,
  onSearchChange,
  onSourceChange,
  onStatusChange,
  scope,
  search,
  scopeFilterOptions,
  source,
  sourceFilterOptions,
  status,
  statusFilterOptions,
}: {
  category: ExtensionCategoryFilter;
  categoryFilterOptions: ExtensionFilterOption<
    Exclude<ExtensionCategoryFilter, "All">
  >[];
  onCategoryChange: (value: ExtensionCategoryFilter) => void;
  onScopeChange: (value: ExtensionScopeFilter) => void;
  onSearchChange: (value: string) => void;
  onSourceChange: (value: ExtensionSourceFilter) => void;
  onStatusChange: (value: ExtensionStatusFilter) => void;
  scope: ExtensionScopeFilter;
  search: string;
  scopeFilterOptions: ExtensionFilterOption<
    Exclude<ExtensionScopeFilter, "All">
  >[];
  source: ExtensionSourceFilter;
  sourceFilterOptions: ExtensionFilterOption<
    Exclude<ExtensionSourceFilter, "All">
  >[];
  status: ExtensionStatusFilter;
  statusFilterOptions: ExtensionFilterOption<
    Exclude<ExtensionStatusFilter, "All">
  >[];
}) {
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
      <ExtensionFacetFilter
        label="Status"
        onValueChange={onStatusChange}
        options={statusFilterOptions}
        value={status}
      />
      <ExtensionFacetFilter
        label="Scope"
        onValueChange={onScopeChange}
        options={scopeFilterOptions}
        value={scope}
      />
      <ExtensionFacetFilter
        label="Category"
        onValueChange={onCategoryChange}
        options={categoryFilterOptions}
        value={category}
      />
      <ExtensionFacetFilter
        label="Source"
        onValueChange={onSourceChange}
        options={sourceFilterOptions}
        value={source}
      />
    </div>
  );
}

function ExtensionCard({
  extension,
  isSelected,
  onSelect,
}: {
  extension: PresentedExtension;
  isSelected: boolean;
  onSelect: (key: string) => void;
}) {
  return (
    <Button
      aria-expanded={isSelected}
      aria-haspopup="dialog"
      className="h-auto min-h-0 w-full items-stretch justify-start rounded-xl border border-border bg-card p-0 text-left text-card-foreground shadow-xs hover:bg-card hover:ring-1 hover:ring-foreground/20 aria-expanded:ring-2 aria-expanded:ring-primary/50"
      onClick={() => onSelect(extension.key)}
      type="button"
      variant="ghost"
    >
      <span className="flex w-full flex-col gap-3 p-4">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate font-mono font-semibold text-sm">
            {extension.displayName}
          </span>
          <Badge variant={extension.badgeVariant}>
            {extension.statusLabel}
          </Badge>
          <span className="ml-auto font-mono text-muted-foreground text-xs">
            {extension.versionLabel}
          </span>
        </span>
        <span className="line-clamp-2 min-h-10 whitespace-normal text-muted-foreground text-sm leading-relaxed">
          {extension.description}
        </span>
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <Badge variant="ghost">{extension.category}</Badge>
          <Badge variant="outline">{extension.scopeLabel}</Badge>
          <span className="ml-auto truncate text-muted-foreground text-xs">
            {extension.metaLabel}
          </span>
        </span>
      </span>
    </Button>
  );
}

function ExtensionDetails({ extension }: { extension: PresentedExtension }) {
  return (
    <>
      <SheetHeader className="border-border border-b pr-12">
        <div className="flex min-w-0 items-center gap-2">
          <SheetTitle className="truncate font-mono font-semibold text-sm">
            {extension.displayName}
            <span className="sr-only"> details</span>
          </SheetTitle>
          <Badge variant={extension.badgeVariant}>
            {extension.statusLabel}
          </Badge>
        </div>
        <SheetDescription>
          Read-only PostgreSQL extension details and safe example SQL.
        </SheetDescription>
      </SheetHeader>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-2">
            {extension.facts.map((fact) => (
              <div
                className="rounded-lg border border-border p-3"
                key={fact.label}
              >
                <div className="font-semibold text-[0.65rem] text-muted-foreground uppercase tracking-wide">
                  {fact.label}
                </div>
                <div className="mt-1 break-words font-mono text-sm">
                  {fact.value}
                </div>
              </div>
            ))}
          </div>
          <p className="text-sm leading-relaxed">{extension.about}</p>
          <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-muted-foreground text-xs leading-relaxed">
            <Info className="mt-0.5 size-4 shrink-0" />
            <span>{extension.applied}</span>
          </div>
          {extension.statusFilter === "available" && extension.installSql ? (
            <div className="space-y-2 rounded-lg bg-muted/50 p-3 text-muted-foreground text-xs leading-relaxed">
              <p>A superuser can install it with:</p>
              <SqlCodeBlock sql={extension.installSql} />
            </div>
          ) : null}
          <section className="space-y-2">
            <h3 className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
              What it gives you
            </h3>
            <div className="space-y-2">
              {extension.provides.map((item) => (
                <div className="flex gap-2" key={item.label}>
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                  <p className="text-sm leading-relaxed">
                    <span className="font-medium font-mono text-xs">
                      {item.label}
                    </span>{" "}
                    : {item.value}
                  </p>
                </div>
              ))}
            </div>
          </section>
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
                Try it
              </h3>
              <span className="text-muted-foreground text-xs">
                read-only, safe to run
              </span>
            </div>
            <SqlCodeBlock sql={extension.exampleSql} />
          </section>
        </div>
      </div>
    </>
  );
}

function paginationLabel({
  filteredCount,
  pageIndex,
  pageSize,
}: {
  filteredCount: number;
  pageIndex: number;
  pageSize: number;
}) {
  const first = pageIndex * pageSize + 1;
  const last = Math.min((pageIndex + 1) * pageSize, filteredCount);
  return `Showing ${first}–${last} of ${filteredCount} extensions`;
}

function ExtensionsGrid({ extensions }: { extensions: Extension[] }) {
  const [search, setSearch] = useUrlTableSearch();
  const [status, setStatus] = useState<ExtensionStatusFilter>("All");
  const [scope, setScope] = useState<ExtensionScopeFilter>("All");
  const [category, setCategory] = useState<ExtensionCategoryFilter>("All");
  const [source, setSource] = useState<ExtensionSourceFilter>("All");
  const [pageSize, setPageSize] = useState(DEFAULT_EXTENSIONS_PAGE_SIZE);
  const [pageIndex, setPageIndex] = useState(0);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const presentedExtensions = presentExtensions(extensions);
  const filterOptions = extensionFilterOptions(presentedExtensions);
  const filteredExtensions = filterPresentedExtensions(presentedExtensions, {
    category,
    scope,
    search,
    source,
    status,
  });
  const pageCount = Math.max(
    1,
    Math.ceil(filteredExtensions.length / pageSize)
  );
  const currentPageIndex = Math.min(pageIndex, pageCount - 1);
  const pageExtensions = filteredExtensions.slice(
    currentPageIndex * pageSize,
    (currentPageIndex + 1) * pageSize
  );
  const selectedExtension = filteredExtensions.find(
    (extension) => extension.key === selectedKey
  );

  function resetPage() {
    setPageIndex(0);
  }

  function handleSearchChange(nextSearch: string) {
    resetPage();
    setSelectedKey(null);
    setSearch(nextSearch);
  }

  function handleStatusChange(nextStatus: ExtensionStatusFilter) {
    resetPage();
    setSelectedKey(null);
    setStatus(nextStatus);
  }

  function handleScopeChange(nextScope: ExtensionScopeFilter) {
    resetPage();
    setSelectedKey(null);
    setScope(nextScope);
  }

  function handleCategoryChange(nextCategory: ExtensionCategoryFilter) {
    resetPage();
    setSelectedKey(null);
    setCategory(nextCategory);
  }

  function handleSourceChange(nextSource: ExtensionSourceFilter) {
    resetPage();
    setSelectedKey(null);
    setSource(nextSource);
  }

  function handlePageSizeChange(nextPageSize: number) {
    resetPage();
    setSelectedKey(null);
    setPageSize(nextPageSize);
  }

  function handleSelectExtension(key: string) {
    setSelectedKey((currentKey) => (currentKey === key ? null : key));
  }

  function handlePreviousPage() {
    setSelectedKey(null);
    setPageIndex((index) => Math.max(0, index - 1));
  }

  function handleNextPage() {
    setSelectedKey(null);
    setPageIndex((index) => Math.min(pageCount - 1, index + 1));
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm">
        {extensionInventorySummary(presentedExtensions)}; installation requires
        a superuser connection; Querylane only reads what is there
      </p>
      <ExtensionFilterBar
        category={category}
        categoryFilterOptions={filterOptions.categories}
        onCategoryChange={handleCategoryChange}
        onScopeChange={handleScopeChange}
        onSearchChange={handleSearchChange}
        onSourceChange={handleSourceChange}
        onStatusChange={handleStatusChange}
        scope={scope}
        scopeFilterOptions={filterOptions.scopes}
        search={search}
        source={source}
        sourceFilterOptions={filterOptions.sources}
        status={status}
        statusFilterOptions={filterOptions.statuses}
      />
      <div className="flex flex-col gap-4">
        <div className="min-w-0 flex-1 space-y-4">
          {pageExtensions.length === 0 ? (
            <EmptyState
              description="Try a different search or filter."
              icon={PackageOpen}
              title="No extensions match"
            />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {pageExtensions.map((extension) => (
                <ExtensionCard
                  extension={extension}
                  isSelected={extension.key === selectedKey}
                  key={extension.key}
                  onSelect={handleSelectExtension}
                />
              ))}
            </div>
          )}
          {filteredExtensions.length > 0 ? (
            <div className="flex flex-wrap items-center gap-4 text-muted-foreground text-sm">
              <span className="shrink-0">
                {paginationLabel({
                  filteredCount: filteredExtensions.length,
                  pageIndex: currentPageIndex,
                  pageSize,
                })}
              </span>
              <div className="w-full sm:min-w-0 sm:flex-1">
                <PaginationFooter
                  hasNext={currentPageIndex < pageCount - 1}
                  hasPrev={currentPageIndex > 0}
                  onNext={handleNextPage}
                  onPageSizeChange={handlePageSizeChange}
                  onPrev={handlePreviousPage}
                  pageLabel={`Page ${currentPageIndex + 1} of ${pageCount}`}
                  pageSize={pageSize}
                  pageSizeLabel="Extensions per page"
                  pageSizeOptions={EXTENSION_PAGE_SIZE_OPTIONS}
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>
      <Sheet
        onOpenChange={(open) => {
          if (!open) {
            setSelectedKey(null);
          }
        }}
        open={selectedExtension !== undefined}
      >
        <SheetContent
          className="w-[min(34rem,calc(100vw-1rem))] gap-0 overflow-hidden p-0 sm:max-w-[34rem]"
          side="right"
        >
          {selectedExtension ? (
            <ExtensionDetails extension={selectedExtension} />
          ) : null}
        </SheetContent>
      </Sheet>
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
          <ExtensionsGrid extensions={extensions} />
        )}
      </div>
    </ResourcePageState>
  );
}

export { BackendDatabaseExtensionsPage };
