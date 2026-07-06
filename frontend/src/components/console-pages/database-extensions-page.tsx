"use client";

import { Check, ChevronLeft, ChevronRight, PackageOpen, X } from "lucide-react";
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
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTableFilter } from "@/components/ui/data-table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
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
type ExtensionPageSize = (typeof EXTENSION_PAGE_SIZE_OPTIONS)[number];

interface ExtensionSelectProps<Value extends string> {
  label: string;
  onValueChange: (value: Value) => void;
  options: ExtensionFilterOption<Value>[];
  value: Value;
}

function isSelectOptionValue<Value extends string>(
  value: string,
  options: ExtensionFilterOption<Value>[]
): value is Value {
  return options.some((option) => option.value === value);
}

function allOption<Value extends string>(): ExtensionFilterOption<
  Value | "All"
> {
  return { label: "all", value: "All" };
}

function ExtensionSelect<Value extends string>({
  label,
  onValueChange,
  options,
  value,
}: ExtensionSelectProps<Value>) {
  const selectedOption = options.find((option) => option.value === value);

  return (
    <Select
      onValueChange={(nextValue) => {
        if (
          typeof nextValue === "string" &&
          isSelectOptionValue(nextValue, options)
        ) {
          onValueChange(nextValue);
        }
      }}
      value={value}
    >
      <SelectTrigger aria-label={label} className="h-8 min-w-32" size="sm">
        <span className="text-muted-foreground">{label}: </span>
        <span>{selectedOption?.label ?? value}</span>
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        {options.map((option) => (
          <SelectItem
            key={option.value}
            label={option.label}
            value={option.value}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function isExtensionPageSize(value: number): value is ExtensionPageSize {
  return EXTENSION_PAGE_SIZE_OPTIONS.some((pageSize) => pageSize === value);
}

function PageSizeSelect({
  onValueChange,
  value,
}: {
  onValueChange: (value: number) => void;
  value: number;
}) {
  const selectedLabel = String(value);
  const options = EXTENSION_PAGE_SIZE_OPTIONS.map((pageSize) => ({
    label: String(pageSize),
    value: String(pageSize),
  }));

  return (
    <Select
      onValueChange={(nextValue) => {
        if (typeof nextValue !== "string") {
          return;
        }
        const nextPageSize = Number(nextValue);
        if (isExtensionPageSize(nextPageSize)) {
          onValueChange(nextPageSize);
        }
      }}
      value={String(value)}
    >
      <SelectTrigger aria-label="Per page" className="h-8 w-28" size="sm">
        <span className="text-muted-foreground">Per page </span>
        <span>{selectedLabel}</span>
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        {options.map((option) => (
          <SelectItem
            key={option.value}
            label={option.label}
            value={option.value}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function statusOptions(
  options: ExtensionFilterOption<Exclude<ExtensionStatusFilter, "All">>[]
): ExtensionFilterOption<ExtensionStatusFilter>[] {
  return [allOption<Exclude<ExtensionStatusFilter, "All">>(), ...options];
}

function scopeOptions(
  options: ExtensionFilterOption<Exclude<ExtensionScopeFilter, "All">>[]
): ExtensionFilterOption<ExtensionScopeFilter>[] {
  return [allOption<Exclude<ExtensionScopeFilter, "All">>(), ...options];
}

function sourceOptions(
  options: ExtensionFilterOption<Exclude<ExtensionSourceFilter, "All">>[]
): ExtensionFilterOption<ExtensionSourceFilter>[] {
  return [allOption<Exclude<ExtensionSourceFilter, "All">>(), ...options];
}

function categoryOptions(
  options: ExtensionFilterOption<Exclude<ExtensionCategoryFilter, "All">>[]
): ExtensionFilterOption<ExtensionCategoryFilter>[] {
  return [allOption<Exclude<ExtensionCategoryFilter, "All">>(), ...options];
}

function ExtensionFilterBar({
  category,
  categoryFilterOptions,
  onCategoryChange,
  onPageSizeChange,
  onScopeChange,
  onSearchChange,
  onSourceChange,
  onStatusChange,
  pageSize,
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
  onPageSizeChange: (value: number) => void;
  onScopeChange: (value: ExtensionScopeFilter) => void;
  onSearchChange: (value: string) => void;
  onSourceChange: (value: ExtensionSourceFilter) => void;
  onStatusChange: (value: ExtensionStatusFilter) => void;
  pageSize: number;
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
      <ExtensionSelect
        label="Status"
        onValueChange={onStatusChange}
        options={statusOptions(statusFilterOptions)}
        value={status}
      />
      <ExtensionSelect
        label="Scope"
        onValueChange={onScopeChange}
        options={scopeOptions(scopeFilterOptions)}
        value={scope}
      />
      <ExtensionSelect
        label="Category"
        onValueChange={onCategoryChange}
        options={categoryOptions(categoryFilterOptions)}
        value={category}
      />
      <ExtensionSelect
        label="Source"
        onValueChange={onSourceChange}
        options={sourceOptions(sourceFilterOptions)}
        value={source}
      />
      <PageSizeSelect onValueChange={onPageSizeChange} value={pageSize} />
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
      aria-pressed={isSelected}
      className="h-auto min-h-0 w-full items-stretch justify-start rounded-xl border border-border bg-card p-0 text-left text-card-foreground shadow-xs hover:bg-card hover:ring-1 hover:ring-foreground/20 aria-pressed:ring-2 aria-pressed:ring-primary/50"
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
            {extension.sourceLabel}
          </span>
        </span>
      </span>
    </Button>
  );
}

function ExtensionDetails({
  extension,
  onClose,
}: {
  extension: PresentedExtension;
  onClose: () => void;
}) {
  return (
    <section
      aria-label={`${extension.displayName} details`}
      className="rounded-xl border border-border bg-card shadow-xs xl:w-96 xl:shrink-0"
    >
      <div className="flex items-center gap-2 border-border border-b p-4">
        <h2 className="truncate font-mono font-semibold text-sm">
          {extension.displayName}
        </h2>
        <Badge variant={extension.badgeVariant}>{extension.statusLabel}</Badge>
        <Button
          aria-label="Close extension details"
          className="ml-auto"
          onClick={onClose}
          size="icon-xs"
          type="button"
          variant="ghost"
        >
          <X />
        </Button>
      </div>
      <div className="flex flex-col gap-5 p-4">
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
        {extension.statusFilter === "available" && extension.installSql ? (
          <div className="rounded-lg bg-muted/50 p-3 text-muted-foreground text-xs leading-relaxed">
            A superuser can install it with:
            <pre className="mt-2 overflow-auto font-mono text-foreground text-xs">
              {extension.installSql}
            </pre>
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
          <h3 className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
            Try it
          </h3>
          <pre className="overflow-auto rounded-lg border border-border bg-muted/50 p-3 font-mono text-xs leading-relaxed">
            {extension.exampleSql}
          </pre>
        </section>
      </div>
    </section>
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
  if (filteredCount === 0) {
    return "No extensions match";
  }
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
    setPageSize(nextPageSize);
  }

  function handleSelectExtension(key: string) {
    setSelectedKey((currentKey) => (currentKey === key ? null : key));
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm">
        {extensionInventorySummary(presentedExtensions)}. Querylane only reads
        what is there
      </p>
      <ExtensionFilterBar
        category={category}
        categoryFilterOptions={filterOptions.categories}
        onCategoryChange={handleCategoryChange}
        onPageSizeChange={handlePageSizeChange}
        onScopeChange={handleScopeChange}
        onSearchChange={handleSearchChange}
        onSourceChange={handleSourceChange}
        onStatusChange={handleStatusChange}
        pageSize={pageSize}
        scope={scope}
        scopeFilterOptions={filterOptions.scopes}
        search={search}
        source={source}
        sourceFilterOptions={filterOptions.sources}
        status={status}
        statusFilterOptions={filterOptions.statuses}
      />
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
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
          <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-sm">
            <span>
              {paginationLabel({
                filteredCount: filteredExtensions.length,
                pageIndex: currentPageIndex,
                pageSize,
              })}
            </span>
            <div className="ml-auto flex items-center gap-2">
              <Button
                aria-label="Previous extensions page"
                disabled={currentPageIndex === 0}
                onClick={() => setPageIndex((index) => Math.max(0, index - 1))}
                size="icon-xs"
                type="button"
                variant="outline"
              >
                <ChevronLeft />
              </Button>
              <span className="font-mono text-xs">
                Page {currentPageIndex + 1} of {pageCount}
              </span>
              <Button
                aria-label="Next extensions page"
                disabled={currentPageIndex >= pageCount - 1}
                onClick={() =>
                  setPageIndex((index) => Math.min(pageCount - 1, index + 1))
                }
                size="icon-xs"
                type="button"
                variant="outline"
              >
                <ChevronRight />
              </Button>
            </div>
          </div>
        </div>
        {selectedExtension ? (
          <ExtensionDetails
            extension={selectedExtension}
            onClose={() => setSelectedKey(null)}
          />
        ) : null}
      </div>
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
