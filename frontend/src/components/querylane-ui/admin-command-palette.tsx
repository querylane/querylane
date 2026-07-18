"use client";

import { useNavigate } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { createContext, use, useMemo, useState } from "react";
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
import { useKeyboardShortcut } from "@/hooks/use-keyboard-shortcut";
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

type NavigationIds = ReturnType<typeof useDb>["navigationIds"];
type CatalogObject = NonNullable<
  ReturnType<typeof useDatabaseCatalogQuery>["data"]
>["objects"][number];
type PaletteRole = NonNullable<
  ReturnType<typeof useListAllRolesQuery>["data"]
>["roles"][number];

function selectNavigationTargets(ids: NavigationIds, query: string) {
  const limit = query ? SEARCH_NAVIGATION_LIMIT : DEFAULT_NAVIGATION_LIMIT;
  return NAVIGATION_TARGETS.filter((target) => {
    const routeTarget = resolveCanonicalAdminPageTarget({
      ids,
      page: target.page,
    });
    return Boolean(routeTarget && matchesQuery(target.label, query));
  }).slice(0, limit);
}

function selectDatabaseObjects(
  objects: CatalogObject[],
  databaseLabel: string,
  query: string
) {
  const limit = query
    ? SEARCH_DATABASE_OBJECT_LIMIT
    : DEFAULT_DATABASE_OBJECT_LIMIT;
  return objects
    .filter((object) =>
      matchesQuery(
        `${databaseLabel}.${object.schemaId}.${object.objectId}`,
        query
      )
    )
    .slice(0, limit);
}

function selectRoles(roles: PaletteRole[], query: string) {
  if (!query) {
    return [];
  }
  return roles
    .filter((role) => matchesQuery(role.roleName, query))
    .slice(0, SEARCH_ROLE_LIMIT);
}

function NavigationTargetGroup({
  onSelect,
  targets,
}: {
  onSelect: (page: AdminPageId) => void;
  targets: typeof NAVIGATION_TARGETS;
}) {
  if (targets.length === 0) {
    return null;
  }
  return (
    <CommandGroup className={COMMAND_GROUP_CLASS_NAME} heading="Go to">
      {targets.map((target) => (
        <CommandItem
          className={COMMAND_ITEM_CLASS_NAME}
          key={target.page}
          onSelect={() => onSelect(target.page)}
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
  );
}

function databaseObjectRowCount(object: CatalogObject): string {
  const rowCount = normalizeEstimatedRowCount(object.rowCount);
  return object.kind === "view" && rowCount === 0
    ? "— rows"
    : `${formatRows(rowCount)} rows`;
}

function DatabaseObjectGroup({
  databaseLabel,
  objects,
  onSelect,
}: {
  databaseLabel: string;
  objects: CatalogObject[];
  onSelect: (object: CatalogObject) => void;
}) {
  if (objects.length === 0) {
    return null;
  }
  return (
    <CommandGroup className={COMMAND_GROUP_CLASS_NAME} heading="Tables">
      {objects.map((object) => {
        const label = `${databaseLabel}.${object.schemaId}.${object.objectId}`;
        return (
          <CommandItem
            className={COMMAND_ITEM_CLASS_NAME}
            key={object.name ?? label}
            onSelect={() => onSelect(object)}
            value={label}
          >
            <ChevronRight className="size-3.5 text-muted-foreground" />
            <span className="font-mono text-[13px]">{label}</span>
            <span className="ml-auto text-[11.5px] text-muted-foreground">
              {databaseObjectRowCount(object)}
            </span>
          </CommandItem>
        );
      })}
    </CommandGroup>
  );
}

function RoleCommandGroup({
  onSelect,
  roles,
}: {
  onSelect: (role: PaletteRole) => void;
  roles: PaletteRole[];
}) {
  if (roles.length === 0) {
    return null;
  }
  return (
    <CommandGroup className={COMMAND_GROUP_CLASS_NAME} heading="Roles">
      {roles.map((role) => (
        <CommandItem
          className={COMMAND_ITEM_CLASS_NAME}
          key={role.name}
          onSelect={() => onSelect(role)}
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
  );
}

function PaletteQueryStatus({
  error,
  errorMessage,
  isPending,
  loadingMessage,
}: {
  error: unknown;
  errorMessage: string;
  isPending: boolean;
  loadingMessage: string;
}) {
  if (isPending) {
    return (
      <output className="block px-4 py-3 text-muted-foreground text-xs">
        {loadingMessage}
      </output>
    );
  }
  if (error) {
    return <p className="px-4 py-3 text-destructive text-xs">{errorMessage}</p>;
  }
  return null;
}

function PaletteSearchFeedback({
  catalogError,
  catalogIsPending,
  hasDatabaseScope,
  hasRoleSearch,
  rolesError,
  rolesIsPending,
}: {
  catalogError: unknown;
  catalogIsPending: boolean;
  hasDatabaseScope: boolean;
  hasRoleSearch: boolean;
  rolesError: unknown;
  rolesIsPending: boolean;
}) {
  const catalogPending = hasDatabaseScope && catalogIsPending;
  const rolesPending = hasRoleSearch && rolesIsPending;
  const catalogFailed = hasDatabaseScope && Boolean(catalogError);
  const rolesFailed = hasRoleSearch && Boolean(rolesError);
  const searchIncomplete =
    catalogPending || rolesPending || catalogFailed || rolesFailed;
  return (
    <>
      {searchIncomplete ? null : (
        <CommandEmpty>No matches: try a table or role name</CommandEmpty>
      )}
      <PaletteQueryStatus
        error={hasDatabaseScope ? catalogError : null}
        errorMessage="Could not load database objects"
        isPending={catalogPending}
        loadingMessage="Loading database objects…"
      />
      {hasRoleSearch ? (
        <PaletteQueryStatus
          error={rolesError}
          errorMessage="Could not load roles"
          isPending={rolesPending}
          loadingMessage="Loading roles…"
        />
      ) : null}
    </>
  );
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
  const hasRoleSearch = normalizedQuery.length > 0;
  const catalogQuery = useDatabaseCatalogQuery({
    databaseId,
    enabled: hasDatabaseScope,
    instanceId,
  });
  const rolesQuery = useListAllRolesQuery(
    instanceId ? rolesForInstanceQueryInput(instanceId) : undefined,
    { enabled: Boolean(instanceId && normalizedQuery) }
  );
  const databaseLabel = selectedDatabase?.name ?? databaseId;
  const navigationTargets = selectNavigationTargets(
    navigationIds,
    normalizedQuery
  );
  const databaseObjects = selectDatabaseObjects(
    catalogQuery.data?.objects ?? [],
    databaseLabel,
    normalizedQuery
  );
  const roles = selectRoles(rolesQuery.data?.roles ?? [], normalizedQuery);

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
        <NavigationTargetGroup
          onSelect={navigateToPage}
          targets={navigationTargets}
        />
        <DatabaseObjectGroup
          databaseLabel={databaseLabel}
          objects={databaseObjects}
          onSelect={navigateToObject}
        />
        <RoleCommandGroup onSelect={navigateToRole} roles={roles} />

        <PaletteSearchFeedback
          catalogError={catalogQuery.error}
          catalogIsPending={catalogQuery.isPending}
          hasDatabaseScope={hasDatabaseScope}
          hasRoleSearch={hasRoleSearch}
          rolesError={rolesQuery.error}
          rolesIsPending={rolesQuery.isPending}
        />
      </CommandList>
    </Command>
  );
}

interface CommandPaletteController {
  openPalette: () => void;
}

const CommandPaletteContext = createContext<CommandPaletteController | null>(
  null
);

/**
 * Provides a single command-palette dialog for the whole shell and the ⌘K
 * shortcut that toggles it. Both the sidebar search trigger and any other
 * caller open it through {@link useCommandPalette}, so there is exactly one
 * dialog instance regardless of how many triggers exist.
 */
function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  useKeyboardShortcut("palette.open", () =>
    setOpen((currentOpen) => !currentOpen)
  );

  const controller = useMemo<CommandPaletteController>(
    () => ({ openPalette: () => setOpen(true) }),
    []
  );

  return (
    <CommandPaletteContext.Provider value={controller}>
      {children}
      <CommandDialog
        className="top-[14%] w-[600px] max-w-[calc(100%-2.5rem)] gap-0 rounded-[14px]! border border-border p-0 shadow-lg sm:max-w-[600px]"
        description="Search tables, screens, and roles in the current Querylane scope."
        onOpenChange={setOpen}
        open={open}
        title="Search or jump to"
      >
        {open ? <AdminCommandPaletteContent onOpenChange={setOpen} /> : null}
      </CommandDialog>
    </CommandPaletteContext.Provider>
  );
}

function useCommandPalette(): CommandPaletteController {
  const controller = use(CommandPaletteContext);
  if (!controller) {
    throw new Error(
      "useCommandPalette must be used within a CommandPaletteProvider."
    );
  }
  return controller;
}

export { CommandPaletteProvider, useCommandPalette };
