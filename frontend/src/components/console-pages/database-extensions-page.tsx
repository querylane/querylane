import { PackageOpen, Search } from "lucide-react";
import { useState } from "react";
import {
  PageHeader,
  ResourcePageState,
} from "@/components/console-pages/console-layout";
import {
  type ExtensionStatusFilter,
  extensionCategoryOptions,
  filterPresentedExtensions,
  type PresentedExtension,
  presentExtensions,
} from "@/components/console-pages/database-extensions-filters";
import { EmptyState } from "@/components/empty-state";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { SqlCodeBlock } from "@/components/ui/sql-code-block";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  extensionsForDatabaseQueryInput,
  useListAllExtensionsQuery,
} from "@/hooks/api/extension";
import { DETAIL_DRAWER_WIDTH_CLASS } from "@/lib/drawer-width";
import {
  type UrlTableSearchRoute,
  useUrlTableSearch,
} from "@/lib/url-search-state";
import { cn } from "@/lib/utils";

const EMPTY_VALUE = "—";

function StatusCell({ extension }: { extension: PresentedExtension }) {
  const installed = extension.statusFilter === "installed";
  return (
    <span className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className={cn(
          "size-2 rounded-full",
          installed ? "bg-success" : "bg-muted-foreground/30"
        )}
      />
      <span
        className={cn(
          "text-xs",
          installed ? "font-medium text-success" : "text-muted-foreground"
        )}
      >
        {extension.statusLabel}
      </span>
    </span>
  );
}

function LedgerRow({
  extension,
  isSelected,
  onSelect,
}: {
  extension: PresentedExtension;
  isSelected: boolean;
  onSelect: (key: string) => void;
}) {
  const installed = extension.statusFilter === "installed";
  return (
    <TableRow
      className={cn(
        "cursor-pointer border-l-2",
        installed
          ? "border-l-success bg-success/[0.04] hover:bg-success/[0.08]"
          : "border-l-transparent"
      )}
      onClick={() => onSelect(extension.key)}
    >
      <TableCell>
        <Button
          aria-expanded={isSelected}
          aria-haspopup="dialog"
          className="h-auto min-h-0 justify-start whitespace-normal p-0 font-medium font-mono text-sm hover:bg-transparent"
          onClick={(event) => {
            event.stopPropagation();
            onSelect(extension.key);
          }}
          size="xs"
          type="button"
          variant="ghost"
        >
          {extension.displayName}
        </Button>
      </TableCell>
      <TableCell>
        <StatusCell extension={extension} />
      </TableCell>
      <TableCell className="font-mono text-muted-foreground text-xs tabular-nums">
        {extension.versionLabel}
      </TableCell>
      <TableCell className="text-muted-foreground text-xs">
        {extension.category ?? EMPTY_VALUE}
      </TableCell>
      <TableCell className="hidden max-w-md truncate text-muted-foreground text-sm lg:table-cell">
        {extension.description}
      </TableCell>
    </TableRow>
  );
}

function statusTabLabel(label: string, count: number) {
  return (
    <span className="flex items-center gap-1.5">
      {label}
      <span className="font-mono text-muted-foreground text-xs tabular-nums">
        {count}
      </span>
    </span>
  );
}

function LedgerToolbar({
  category,
  categoryOptions,
  extensions,
  filteredCount,
  onCategoryChange,
  onSearchChange,
  onStatusChange,
  search,
  status,
}: {
  category: string;
  categoryOptions: { label: string; value: string }[];
  extensions: PresentedExtension[];
  filteredCount: number;
  onCategoryChange: (category: string) => void;
  onSearchChange: (search: string) => void;
  onStatusChange: (status: ExtensionStatusFilter) => void;
  search: string;
  status: ExtensionStatusFilter;
}) {
  const installedCount = extensions.filter(
    (extension) => extension.statusFilter === "installed"
  ).length;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-64">
        <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label="Search extensions…"
          className="pl-8"
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search extensions…"
          value={search}
        />
      </div>
      <Tabs
        onValueChange={(value) =>
          onStatusChange(value as ExtensionStatusFilter)
        }
        value={status}
      >
        <TabsList>
          <TabsTrigger value="All">
            {statusTabLabel("All", extensions.length)}
          </TabsTrigger>
          <TabsTrigger value="installed">
            {statusTabLabel("Installed", installedCount)}
          </TabsTrigger>
          <TabsTrigger value="available">
            {statusTabLabel("Available", extensions.length - installedCount)}
          </TabsTrigger>
        </TabsList>
      </Tabs>
      {categoryOptions.length > 0 ? (
        <Select
          onValueChange={(value) => onCategoryChange(value ?? "All")}
          value={category}
        >
          <SelectTrigger aria-label="Category" className="w-44">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All categories</SelectItem>
            {categoryOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
      <span className="ml-auto text-muted-foreground text-xs">
        {filteredCount} of {extensions.length} extensions
      </span>
    </div>
  );
}

function DrawerStatusHero({ extension }: { extension: PresentedExtension }) {
  if (extension.statusFilter === "installed") {
    const detailLine = [
      extension.schema ? `schema ${extension.schema}` : undefined,
      extension.scopeLabel,
      extension.metaLabel,
    ]
      .filter(Boolean)
      .join(" · ");
    return (
      <div className="rounded-lg border border-success/30 bg-success/5 p-3">
        <p className="flex items-center gap-2 font-medium text-sm text-success">
          <span aria-hidden="true" className="size-2 rounded-full bg-success" />
          Installed · {extension.installedVersion || extension.versionLabel}
        </p>
        {detailLine ? (
          <p className="mt-1 text-muted-foreground text-xs">{detailLine}</p>
        ) : null}
      </div>
    );
  }
  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
      <p className="flex items-center gap-2 font-medium text-sm">
        <span
          aria-hidden="true"
          className="size-2 rounded-full bg-muted-foreground/40"
        />
        Not installed in this database
      </p>
      <SqlCodeBlock sql={extension.installSql} wrap={true} />
      <p className="text-muted-foreground text-xs">
        Requires a superuser connection; Querylane only reads what is there.
      </p>
    </div>
  );
}

function DrawerDetailsList({ extension }: { extension: PresentedExtension }) {
  return (
    <dl className="space-y-1.5">
      {extension.facts.map((fact) => (
        <div
          className="flex items-baseline justify-between gap-4 text-sm"
          key={fact.label}
        >
          <dt className="text-muted-foreground">{fact.label}</dt>
          <dd className="break-words text-right font-mono">{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function CuratedDrawerSections({
  extension,
}: {
  extension: PresentedExtension;
}) {
  const { curated } = extension;
  if (!curated) {
    return (
      <section className="space-y-2">
        <h3 className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
          Details
        </h3>
        <DrawerDetailsList extension={extension} />
      </section>
    );
  }
  return (
    <>
      <section className="space-y-2">
        <div className="flex items-baseline gap-2">
          <h3 className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
            Try it
          </h3>
          <span className="text-muted-foreground text-xs">
            read-only, safe to run
          </span>
        </div>
        <SqlCodeBlock sql={curated.exampleSql} wrap={true} />
      </section>
      <Accordion defaultValue={["about"]}>
        <AccordionItem value="about">
          <AccordionTrigger className="text-sm">What it is</AccordionTrigger>
          <AccordionContent>
            <div className="space-y-2">
              <p className="text-sm leading-relaxed">{curated.about}</p>
              <p className="text-muted-foreground text-xs leading-relaxed">
                {curated.applied}
              </p>
            </div>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="capabilities">
          <AccordionTrigger className="text-sm">
            What it gives you
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-2">
              {curated.provides.map((item) => (
                <p className="text-sm leading-relaxed" key={item.label}>
                  <span className="font-medium font-mono text-xs">
                    {item.label}
                  </span>
                  <span className="text-muted-foreground"> — {item.value}</span>
                </p>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="details">
          <AccordionTrigger className="text-sm">Details</AccordionTrigger>
          <AccordionContent>
            <DrawerDetailsList extension={extension} />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </>
  );
}

function ExtensionDrawer({
  extension,
  onClose,
}: {
  extension: PresentedExtension | undefined;
  onClose: () => void;
}) {
  return (
    <Sheet
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      open={extension !== undefined}
    >
      <SheetContent
        className={cn("gap-0 overflow-hidden p-0", DETAIL_DRAWER_WIDTH_CLASS)}
        side="right"
      >
        {extension ? (
          <>
            <SheetHeader className="border-border border-b pr-12">
              <div className="flex min-w-0 items-center gap-2">
                <SheetTitle className="truncate font-mono font-semibold text-base">
                  {extension.displayName}
                  <span className="sr-only"> details</span>
                </SheetTitle>
                <Badge variant={extension.badgeVariant}>
                  {extension.statusLabel}
                </Badge>
                <span className="ml-auto font-mono text-muted-foreground text-xs tabular-nums">
                  {extension.versionLabel}
                </span>
              </div>
              <SheetDescription className="text-left">
                {extension.description ||
                  "The server reports no description for this extension."}
              </SheetDescription>
            </SheetHeader>
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
              <DrawerStatusHero extension={extension} />
              <CuratedDrawerSections extension={extension} />
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function ExtensionsLedger({
  extensions,
  searchRoute,
}: {
  extensions: PresentedExtension[];
  searchRoute: UrlTableSearchRoute;
}) {
  const [search, setSearch] = useUrlTableSearch(searchRoute);
  const [status, setStatus] = useState<ExtensionStatusFilter>("All");
  const [category, setCategory] = useState("All");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const categoryOptions = extensionCategoryOptions(extensions);
  const filtered = filterPresentedExtensions(extensions, {
    category,
    search,
    status,
  });
  const selected = extensions.find(
    (extension) => extension.key === selectedKey
  );

  return (
    <div className="flex flex-col gap-4">
      <LedgerToolbar
        category={category}
        categoryOptions={categoryOptions}
        extensions={extensions}
        filteredCount={filtered.length}
        onCategoryChange={setCategory}
        onSearchChange={setSearch}
        onStatusChange={setStatus}
        search={search}
        status={status}
      />
      {filtered.length === 0 ? (
        <EmptyState
          description="Try a different search or filter."
          icon={PackageOpen}
          title="No extensions match"
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow className="border-l-2 border-l-transparent hover:bg-transparent">
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="hidden lg:table-cell">
                  Description
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((extension) => (
                <LedgerRow
                  extension={extension}
                  isSelected={extension.key === selectedKey}
                  key={extension.key}
                  onSelect={(key) =>
                    setSelectedKey((currentKey) =>
                      currentKey === key ? null : key
                    )
                  }
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <ExtensionDrawer
        extension={selected}
        onClose={() => setSelectedKey(null)}
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
  searchRoute,
}: {
  databaseId: string;
  instanceId: string;
  searchRoute: UrlTableSearchRoute;
}) {
  const input = extensionsForDatabaseQueryInput({ databaseId, instanceId });
  const extensionsQuery = useListAllExtensionsQuery(input, {
    enabled: Boolean(instanceId && databaseId),
    refetchOnWindowFocus: false,
  });
  const extensions = presentExtensions(extensionsQuery.data?.extensions ?? []);
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
          <ExtensionsLedger extensions={extensions} searchRoute={searchRoute} />
        )}
      </div>
    </ResourcePageState>
  );
}

export { BackendDatabaseExtensionsPage };
