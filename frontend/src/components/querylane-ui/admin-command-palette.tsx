"use client";

import { useNavigate } from "@tanstack/react-router";
import { ChevronRight, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { formatRows } from "@/features/data-explorer/format-rows";
import { useDatabaseCatalogQuery } from "@/hooks/api/database-catalog";
import {
  rolesForInstanceQueryInput,
  useListAllRolesQuery,
} from "@/hooks/api/role";
import {
  buildCanonicalAdminSearch,
  resolveCanonicalAdminPageTarget,
} from "@/lib/admin-navigation";
import type { AdminPageId } from "@/lib/admin-page";
import { normalizeEstimatedRowCount } from "@/lib/console-resources";
import { useDb } from "@/lib/db-context";
import { handleNavigationResult } from "@/lib/navigation-errors";
import { deriveRoleKind, ROLE_KIND_LABEL, roleIdOf } from "@/lib/role-display";

interface NavigationTarget {
  label: string;
  page: AdminPageId;
  summary: string;
}

const NAVIGATION_TARGETS: readonly NavigationTarget[] = [
  {
    label: "Overview",
    page: "database.overview",
    summary: "database",
  },
  {
    label: "Data Explorer",
    page: "database.explorer",
    summary: "tables · views",
  },
  {
    label: "Roles",
    page: "instance.roles",
    summary: "users and grants",
  },
  {
    label: "Extensions",
    page: "database.extensions",
    summary: "installed modules",
  },
  {
    label: "Configuration",
    page: "instance.configuration",
    summary: "connection details",
  },
  {
    label: "Instance overview",
    page: "instance.overview",
    summary: "instance",
  },
];

const DEFAULT_NAVIGATION_LIMIT = 4;
const SEARCH_NAVIGATION_LIMIT = 8;
const DEFAULT_DATABASE_OBJECT_LIMIT = 5;
const SEARCH_DATABASE_OBJECT_LIMIT = 10;
const SEARCH_ROLE_LIMIT = 5;
const COMMAND_GROUP_CLASS_NAME =
  "p-0 **:[[cmdk-group-heading]]:px-4 **:[[cmdk-group-heading]]:pt-2.5 **:[[cmdk-group-heading]]:pb-1 **:[[cmdk-group-heading]]:font-semibold **:[[cmdk-group-heading]]:text-[10.5px] **:[[cmdk-group-heading]]:uppercase **:[[cmdk-group-heading]]:tracking-[0.06em]";
const COMMAND_ITEM_CLASS_NAME =
  "rounded-none! px-4 py-2 [&>svg:last-child]:hidden";

function matchesQuery(value: string, query: string): boolean {
  return query.length === 0 || value.toLowerCase().includes(query);
}

function CatalogQueryStatus({
  error,
  isPending,
}: {
  error: unknown;
  isPending: boolean;
}) {
  if (isPending) {
    return (
      <output className="block px-4 py-3 text-muted-foreground text-xs">
        Loading database objects…
      </output>
    );
  }
  if (error) {
    return (
      <p className="px-4 py-3 text-destructive text-xs">
        Could not load database objects
      </p>
    );
  }
  return null;
}

function AdminCommandPaletteContent({
  onOpenChange,
}: {
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const { navigationIds, selectedDatabase } = useDb();
  const [query, setQuery] = useState("");
  const instanceId = navigationIds.instanceId ?? "";
  const databaseId = navigationIds.databaseId ?? "";
  const hasDatabaseScope = Boolean(instanceId && databaseId);
  const normalizedQuery = query.trim().toLowerCase();
  const catalogQuery = useDatabaseCatalogQuery({
    databaseId,
    enabled: hasDatabaseScope,
    instanceId,
  });
  const rolesQuery = useListAllRolesQuery(
    instanceId ? rolesForInstanceQueryInput(instanceId) : undefined,
    { enabled: Boolean(instanceId && normalizedQuery) }
  );
  const navigationTargets = NAVIGATION_TARGETS.filter((target) => {
    const routeTarget = resolveCanonicalAdminPageTarget({
      ids: navigationIds,
      page: target.page,
    });
    return routeTarget && matchesQuery(target.label, normalizedQuery);
  }).slice(
    0,
    normalizedQuery ? SEARCH_NAVIGATION_LIMIT : DEFAULT_NAVIGATION_LIMIT
  );
  const databaseObjects = (catalogQuery.data?.objects ?? [])
    .filter((object) => {
      const label = `${selectedDatabase?.name ?? databaseId}.${object.schemaId}.${object.objectId}`;
      return matchesQuery(label, normalizedQuery);
    })
    .slice(
      0,
      normalizedQuery
        ? SEARCH_DATABASE_OBJECT_LIMIT
        : DEFAULT_DATABASE_OBJECT_LIMIT
    );
  const roles = normalizedQuery
    ? (rolesQuery.data?.roles ?? [])
        .filter((role) => matchesQuery(role.roleName, normalizedQuery))
        .slice(0, SEARCH_ROLE_LIMIT)
    : [];

  function close() {
    onOpenChange(false);
  }

  function navigateToPage(page: AdminPageId) {
    const target = resolveCanonicalAdminPageTarget({
      ids: navigationIds,
      page,
    });
    if (!target) {
      return;
    }
    handleNavigationResult(
      navigate({
        ...target,
        search: (previous) =>
          buildCanonicalAdminSearch(previous, { targetPage: page }),
      }),
      { area: "admin-command-palette.page" }
    );
    close();
  }

  function navigateToObject(object: (typeof databaseObjects)[number]) {
    if (!(instanceId && databaseId)) {
      return;
    }
    handleNavigationResult(
      navigate({
        params: { databaseId, instanceId },
        search: {
          category: object.kind === "view" ? "views" : "tables",
          name: object.objectId,
          schema: object.schemaId,
        },
        to: "/instances/$instanceId/databases/$databaseId/explorer",
      }),
      { area: "admin-command-palette.object" }
    );
    close();
  }

  function navigateToRole(role: (typeof roles)[number]) {
    if (!instanceId) {
      return;
    }
    handleNavigationResult(
      navigate({
        params: { instanceId, roleId: roleIdOf(role) },
        to: "/instances/$instanceId/roles/$roleId",
      }),
      { area: "admin-command-palette.role" }
    );
    close();
  }

  return (
    <Command
      className="rounded-[14px]! p-0 [&_[data-slot=command-input-wrapper]]:p-0 [&_[data-slot=input-group-addon]]:pl-4! [&_[data-slot=input-group]]:h-[52px]! [&_[data-slot=input-group]]:rounded-none! [&_[data-slot=input-group]]:border-0! [&_[data-slot=input-group]]:border-b! [&_[data-slot=input-group]]:border-border! [&_[data-slot=input-group]]:bg-transparent! [&_[data-slot=input-group]]:shadow-none!"
      label="Search tables, screens, roles, or saved queries"
      shouldFilter={false}
    >
      <div className="relative">
        <CommandInput
          aria-label="Search tables, screens, roles, or saved queries"
          autoFocus={true}
          className="pr-16 text-sm"
          onValueChange={setQuery}
          placeholder="Jump to a table, screen, role, or saved query…"
          value={query}
        />
        <kbd className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 rounded-md bg-muted px-2 py-1 font-mono text-muted-foreground text-xs">
          esc
        </kbd>
      </div>
      <CommandList className="max-h-[380px] pb-1.5">
        <CommandEmpty>No matches — try a table or role name</CommandEmpty>

        {navigationTargets.length > 0 ? (
          <CommandGroup className={COMMAND_GROUP_CLASS_NAME} heading="Go to">
            {navigationTargets.map((target) => (
              <CommandItem
                className={COMMAND_ITEM_CLASS_NAME}
                key={target.page}
                onSelect={() => navigateToPage(target.page)}
                value={target.label}
              >
                <ChevronRight className="size-3.5 text-muted-foreground" />
                <span className="text-[13px]">{target.label}</span>
                <span className="ml-auto text-[11.5px] text-muted-foreground">
                  {target.summary}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {databaseObjects.length > 0 ? (
          <CommandGroup className={COMMAND_GROUP_CLASS_NAME} heading="Tables">
            {databaseObjects.map((object) => {
              const label = `${selectedDatabase?.name ?? databaseId}.${object.schemaId}.${object.objectId}`;
              const rowCount = normalizeEstimatedRowCount(object.rowCount);
              return (
                <CommandItem
                  className={COMMAND_ITEM_CLASS_NAME}
                  key={object.name ?? label}
                  onSelect={() => navigateToObject(object)}
                  value={label}
                >
                  <ChevronRight className="size-3.5 text-muted-foreground" />
                  <span className="font-mono text-[13px]">{label}</span>
                  <span className="ml-auto text-[11.5px] text-muted-foreground">
                    {object.kind === "view" && rowCount === 0
                      ? "— rows"
                      : `${formatRows(rowCount)} rows`}
                  </span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        ) : null}

        {roles.length > 0 ? (
          <CommandGroup className={COMMAND_GROUP_CLASS_NAME} heading="Roles">
            {roles.map((role) => (
              <CommandItem
                className={COMMAND_ITEM_CLASS_NAME}
                key={role.name}
                onSelect={() => navigateToRole(role)}
                value={role.roleName}
              >
                <ChevronRight className="size-3.5 text-muted-foreground" />
                <span className="font-mono text-[13px]">{role.roleName}</span>
                <span className="ml-auto text-[11.5px] text-muted-foreground">
                  {ROLE_KIND_LABEL[deriveRoleKind(role)].toLowerCase()}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        <CatalogQueryStatus
          error={hasDatabaseScope ? catalogQuery.error : null}
          isPending={hasDatabaseScope && catalogQuery.isPending}
        />
      </CommandList>
    </Command>
  );
}

function AdminCommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((currentOpen) => !currentOpen);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <>
      <Button
        aria-keyshortcuts="Meta+K Control+K"
        aria-label="Search or jump to"
        className="hidden h-8 w-[300px] max-w-[24vw] justify-start gap-2 border-border bg-muted px-2.5 font-normal text-muted-foreground shadow-none hover:border-ring hover:bg-muted lg:flex"
        onClick={() => setOpen(true)}
        type="button"
        variant="outline"
      >
        <Search className="size-3.5" />
        <span className="truncate text-[13px]">Search or jump to…</span>
        <span aria-hidden="true" className="ml-auto flex gap-0.5">
          <kbd className="flex size-5 items-center justify-center rounded bg-background/70 font-mono text-[10px]">
            ⌘
          </kbd>
          <kbd className="flex size-5 items-center justify-center rounded bg-background/70 font-mono text-[10px]">
            K
          </kbd>
        </span>
      </Button>

      <CommandDialog
        className="top-[14%] w-[600px] max-w-[calc(100%-2.5rem)] gap-0 rounded-[14px]! border border-border p-0 shadow-lg sm:max-w-[600px]"
        description="Search tables, screens, and roles in the current Querylane scope."
        onOpenChange={setOpen}
        open={open}
        title="Search or jump to"
      >
        {open ? <AdminCommandPaletteContent onOpenChange={setOpen} /> : null}
      </CommandDialog>
    </>
  );
}

export { AdminCommandPalette };
