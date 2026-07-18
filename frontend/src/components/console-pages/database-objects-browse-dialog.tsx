import { useEffect, useState } from "react";
import type { OtherObjectCategory } from "@/components/console-pages/database-object-categories";
import {
  ExtensionRow,
  ObjectRow,
} from "@/components/console-pages/database-object-rows";
import { useOtherObjectsBrowseQuery } from "@/components/console-pages/other-database-objects-query";
import { RetryActionButton } from "@/components/retry-action-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { Extension } from "@/protogen/querylane/console/v1alpha1/extension_pb";

const SEARCH_DEBOUNCE_MS = 250;
const LOADING_ROW_KEYS = ["first", "second", "third", "fourth"] as const;

function useDebouncedValue(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(
    function syncDebouncedValue() {
      const timer = setTimeout(() => setDebounced(value), delayMs);
      return () => clearTimeout(timer);
    },
    [value, delayMs]
  );
  return debounced;
}

function BrowseLoadingRows() {
  return (
    <div
      aria-label="Loading objects"
      className="flex flex-col gap-2 py-2"
      role="status"
    >
      <span className="sr-only">Loading objects</span>
      {LOADING_ROW_KEYS.map((key) => (
        <Skeleton aria-hidden="true" className="h-7 w-full" key={key} />
      ))}
    </div>
  );
}

function BrowseDialogShell({
  children,
  label,
  onOpenChange,
  onSearchChange,
  open,
  search,
  total,
}: {
  children: React.ReactNode;
  label: string;
  onOpenChange: (open: boolean) => void;
  onSearchChange: (value: string) => void;
  open: boolean;
  search: string;
  total: number;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="flex max-h-[min(42rem,85vh)] flex-col gap-4 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>
            {total === 1 ? "1 object" : `${total} objects`} in this database
          </DialogDescription>
        </DialogHeader>
        <Input
          aria-label={`Search ${label.toLowerCase()} by name`}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search by name…"
          value={search}
        />
        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BrowseResults({
  isEmpty,
  isError,
  isLoading,
  onRetry,
  children,
}: {
  children: React.ReactNode;
  isEmpty: boolean;
  isError: boolean;
  isLoading: boolean;
  onRetry: () => Promise<unknown>;
}) {
  if (isLoading) {
    return <BrowseLoadingRows />;
  }
  if (isError) {
    return (
      <div className="flex flex-col items-start gap-3 py-2">
        <p className="text-[13px] text-muted-foreground">
          Failed to load objects.
        </p>
        <RetryActionButton
          label="Retry"
          onRetry={onRetry}
          size="xs"
          variant="outline"
        />
      </div>
    );
  }
  if (isEmpty) {
    return (
      <p className="py-2 text-[13px] text-muted-foreground">
        No objects match this search.
      </p>
    );
  }
  return children;
}

/**
 * Server-driven "View all" surface for one object category: name search and
 * keyset-paginated pages, so a category with thousands of objects never lands
 * in the DOM (or over the wire) at once.
 */
function CategoryBrowseDialog({
  category,
  databaseId,
  instanceId,
  label,
  onOpenChange,
  open,
  total,
}: {
  category: OtherObjectCategory;
  databaseId: string;
  instanceId: string;
  label: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  total: number;
}) {
  const [searchInput, setSearchInput] = useState("");
  const search = useDebouncedValue(searchInput.trim(), SEARCH_DEBOUNCE_MS);
  const browse = useOtherObjectsBrowseQuery({
    category,
    databaseId,
    instanceId,
    search,
  });
  const objects = (browse.data?.pages ?? []).flatMap((page) => page.objects);

  return (
    <BrowseDialogShell
      label={label}
      onOpenChange={onOpenChange}
      onSearchChange={setSearchInput}
      open={open}
      search={searchInput}
      total={total}
    >
      <BrowseResults
        isEmpty={objects.length === 0}
        isError={Boolean(browse.error)}
        isLoading={browse.isLoading}
        onRetry={() => browse.refetch()}
      >
        <div className="flex flex-col">
          {objects.map((object) => (
            <ObjectRow
              key={`${object.category}:${object.name}`}
              object={object}
            />
          ))}
        </div>
        {browse.hasNextPage ? (
          <Button
            className="mt-3 w-full"
            disabled={browse.isFetchingNextPage}
            onClick={() => browse.fetchNextPage()}
            size="sm"
            type="button"
            variant="outline"
          >
            {browse.isFetchingNextPage ? "Loading…" : "Load more"}
          </Button>
        ) : null}
      </BrowseResults>
    </BrowseDialogShell>
  );
}

/**
 * Client-side "View all" for installed extensions: the full list is already
 * loaded (and naturally bounded), so only search happens here.
 */
function ExtensionsBrowseDialog({
  extensions,
  onOpenChange,
  open,
}: {
  extensions: Extension[];
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const [search, setSearch] = useState("");
  const needle = search.trim().toLowerCase();
  const visible = needle
    ? extensions.filter((extension) =>
        `${extension.displayName} ${extension.comment}`
          .toLowerCase()
          .includes(needle)
      )
    : extensions;

  return (
    <BrowseDialogShell
      label="Extensions"
      onOpenChange={onOpenChange}
      onSearchChange={setSearch}
      open={open}
      search={search}
      total={extensions.length}
    >
      {visible.length === 0 ? (
        <p className="py-2 text-[13px] text-muted-foreground">
          No extensions match this search.
        </p>
      ) : (
        <div className="flex flex-col">
          {visible.map((extension) => (
            <ExtensionRow extension={extension} key={extension.name} />
          ))}
        </div>
      )}
    </BrowseDialogShell>
  );
}

export { CategoryBrowseDialog, ExtensionsBrowseDialog };
