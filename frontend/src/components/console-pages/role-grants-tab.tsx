"use client";

import {
  Clock,
  Copy,
  Database,
  Globe,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { Fragment, type ReactNode, useState } from "react";
import type { GrantsView } from "@/components/console-pages/role-detail-search";
import { GrantedObjectsTable } from "@/components/console-pages/role-grants-object-table";
import {
  GrantsOverview,
  OverviewLede,
} from "@/components/console-pages/role-grants-overview";
import { OwnsGrantsView } from "@/components/console-pages/role-grants-owns-view";
import {
  AbbrPill,
  BackBar,
  ContentHead,
  GrantsEmptyState,
} from "@/components/console-pages/role-grants-pills";
import { SchemaGrantsView } from "@/components/console-pages/role-grants-schema-view";
import {
  aggregateGrants,
  buildSchemaIndex,
  DEFAULT_PRIV_OBJECT_LABEL,
  type DefaultPrivilegeRule,
  type FacetStates,
  type GrantedObject,
  groupDefaultPrivileges,
  type SchemaGrantGroup,
  TABLE_LIKE_TYPES,
} from "@/components/console-pages/role-grants-shared";
import { EmptyState } from "@/components/empty-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PredefinedRoleInfo, RoleKind } from "@/lib/role-display";
import { cn } from "@/lib/utils";
import {
  GrantObjectType,
  type ObjectGrant,
  type OwnedObject,
  type RoleDefaultPrivilege,
} from "@/protogen/querylane/console/v1alpha1/role_pb";

// ───────── Default privileges (sentence list) ─────────

function DefaultsBody({
  partial,
  rules,
}: {
  partial: boolean;
  rules: DefaultPrivilegeRule[];
}) {
  if (rules.length === 0) {
    return (
      <GrantsEmptyState
        title={partial ? "Default privilege results are incomplete" : undefined}
      >
        {partial ? (
          "No default privileges are shown in the available results."
        ) : (
          <>
            No{" "}
            <span className="font-mono text-foreground/80">
              ALTER DEFAULT PRIVILEGES
            </span>{" "}
            rules apply to this role.
          </>
        )}
      </GrantsEmptyState>
    );
  }
  return (
    <div className="flex flex-col overflow-hidden rounded-md border border-border">
      {rules.map((rule) => (
        <div
          className="grid grid-cols-[1fr_auto] items-center gap-4 border-border not-first:border-t px-4 py-3 text-sm"
          key={rule.key}
        >
          <span className="leading-relaxed">
            <span className="text-muted-foreground">When </span>
            <span className="font-mono text-[12.5px] text-foreground/85">
              {rule.creatorRoleName}
            </span>
            <span className="text-muted-foreground"> creates new </span>
            <strong className="font-medium">
              {DEFAULT_PRIV_OBJECT_LABEL[rule.objectType]}
            </strong>
            <span className="text-muted-foreground"> in </span>
            <span className="font-mono text-[12.5px] text-foreground/85">
              {rule.schemaName || "any schema"}
            </span>
            <span className="text-muted-foreground"> → grant </span>
            {rule.privileges.map((privilege, index) => (
              <Fragment key={privilege.name}>
                <strong className="font-medium">{privilege.name}</strong>
                {index < rule.privileges.length - 1 ? (
                  <span className="text-muted-foreground">, </span>
                ) : null}
              </Fragment>
            ))}
            <span className="text-muted-foreground"> to this role.</span>
          </span>
          <span className="flex shrink-0 items-center gap-1">
            {rule.privileges.map((privilege) => (
              <AbbrPill
                grantable={privilege.grantable}
                key={privilege.name}
                name={privilege.name}
                state="held"
              />
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}

// ───────── Reach drill-in wrappers ─────────

function DefaultsDrillView({
  partial,
  rules,
}: {
  partial: boolean;
  rules: DefaultPrivilegeRule[];
}) {
  return (
    <div className="flex flex-col">
      <ContentHead
        count={rules.length}
        countUnit="rule"
        icon={Clock}
        iconClassName="text-violet-600 dark:text-violet-300"
        partial={partial}
        title="Default privileges"
      />
      <div className="-mt-3.5 pb-3.5 text-muted-foreground text-xs">
        <span className="font-mono text-foreground/75">
          ALTER DEFAULT PRIVILEGES
        </span>{" "}
        rules that grant privileges on objects that don&apos;t exist yet.
      </div>
      <DefaultsBody partial={partial} rules={rules} />
    </div>
  );
}

function PublicDrillView({
  objects,
  partial,
}: {
  objects: GrantedObject[];
  partial: boolean;
}) {
  const [activeKind, setActiveKind] = useState("all");
  const [search, setSearch] = useState("");
  return (
    <div className="flex flex-col">
      <ContentHead
        count={objects.length}
        icon={Globe}
        iconClassName="text-sky-600 dark:text-sky-400"
        partial={partial}
        title="Granted to PUBLIC"
      />
      <div className="-mt-3.5 pb-3.5 text-muted-foreground text-xs">
        Granted to every role in this database, including this one. Not unique
        to this role.
      </div>
      {objects.length === 0 ? (
        <GrantsEmptyState
          title={partial ? "PUBLIC grant results are incomplete" : undefined}
        >
          {partial ? (
            "No PUBLIC grants are shown in the available results."
          ) : (
            <>
              No grants to{" "}
              <span className="font-mono text-foreground/80">PUBLIC</span> are
              visible from this role.
            </>
          )}
        </GrantsEmptyState>
      ) : (
        <GrantedObjectsTable
          activeKind={activeKind}
          objects={objects}
          onKindChange={(slug) => {
            setActiveKind(slug);
            setSearch("");
          }}
          onSearchChange={setSearch}
          search={search}
        />
      )}
    </div>
  );
}

// ───────── Access headline badge ─────────

type HeadlineTone = "danger" | "info" | "rw" | "ro" | "usage";
const HEADLINE_TONE_CLASS: Record<HeadlineTone, string> = {
  danger: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400",
  info: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400",
  ro: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  rw: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  usage: "border-border bg-muted text-muted-foreground",
};

// The "Direct:" prefix keeps the badge from reading as a complete access
// posture (ownership, PUBLIC, membership, and built-in roles can add access).
const DIRECT_GRANT_TITLE =
  "Summarizes this role's direct grants only. Ownership, PUBLIC, role membership, and built-in roles can add access that isn't reflected here.";

function grantsHeadline(
  objects: GrantedObject[],
  kind: RoleKind
): { label: string; title: string; tone: HeadlineTone } | null {
  // Superuser / replication have a dedicated banner above — don't duplicate the
  // caveat as a badge too.
  if (kind === "super" || kind === "repl") {
    return null;
  }
  const tableObjects = objects.filter((object) =>
    TABLE_LIKE_TYPES.has(object.objectType)
  );
  const writes = tableObjects.some((object) =>
    object.privileges.some((privilege) => privilege.name !== "SELECT")
  );
  if (tableObjects.length > 0) {
    return writes
      ? { label: "Direct: read + write", title: DIRECT_GRANT_TITLE, tone: "rw" }
      : { label: "Direct: read only", title: DIRECT_GRANT_TITLE, tone: "ro" };
  }
  const hasScope = objects.some(
    (object) =>
      object.objectType === GrantObjectType.SCHEMA ||
      object.objectType === GrantObjectType.DATABASE
  );
  if (hasScope) {
    return {
      label: "Direct: schema/database grants",
      title: DIRECT_GRANT_TITLE,
      tone: "usage",
    };
  }
  return null;
}

function HeadlineBadge({
  kind,
  objects,
}: {
  kind: RoleKind;
  objects: GrantedObject[];
}) {
  const headline = grantsHeadline(objects, kind);
  if (!headline) {
    return null;
  }
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-md border px-2 font-medium text-xs",
        HEADLINE_TONE_CLASS[headline.tone]
      )}
      title={headline.title}
    >
      {headline.label}
    </span>
  );
}

function DatabaseSelect({
  databases,
  onChange,
  value,
}: {
  databases: { id: string; name: string }[];
  onChange: (value: string) => void;
  value: string | undefined;
}) {
  return (
    <Select
      // Base UI's <Select.Value> needs an `items` map to render the selected
      // item's label; without it the trigger shows the raw value (database id).
      items={databases.map((database) => ({
        label: database.name,
        value: database.id,
      }))}
      onValueChange={(next) => {
        if (next != null) {
          onChange(next);
        }
      }}
      value={value}
    >
      <SelectTrigger size="sm">
        <Database className="size-3.5 text-muted-foreground" />
        <SelectValue placeholder="Select database" />
      </SelectTrigger>
      <SelectContent>
        {databases.map((database) => (
          <SelectItem key={database.id} value={database.id}>
            {database.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ───────── Character banners (superuser / replication / built-in) ─────────

function CharacterBanner({
  builtinInfo,
  kind,
  roleName,
}: {
  builtinInfo: PredefinedRoleInfo | null;
  kind: RoleKind;
  roleName: string;
}) {
  if (kind === "builtin") {
    return (
      <Alert>
        <ShieldCheck aria-hidden="true" />
        <AlertTitle>
          Built-in role: grants implicit privileges to its members
        </AlertTitle>
        <AlertDescription>
          <span className="font-mono">{roleName}</span> ships with Postgres;
          there are no GRANT rows. Members automatically receive:
          {builtinInfo ? (
            <ul className="mt-1.5 list-disc pl-4">
              {builtinInfo.implicit.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : (
            <span>
              {" "}
              its hard-coded privileges (the exact set depends on the PostgreSQL
              version).
            </span>
          )}
        </AlertDescription>
      </Alert>
    );
  }
  if (kind === "super") {
    return (
      <Alert>
        <ShieldAlert aria-hidden="true" />
        <AlertTitle>Superuser: object grants don&apos;t gate access</AlertTitle>
        <AlertDescription>
          <span className="font-mono">{roleName}</span> bypasses every
          permission check, so these grants don&apos;t determine what it can do.
          The grants below are shown for audit. Revoke SUPERUSER for grant-level
          control.
        </AlertDescription>
      </Alert>
    );
  }
  if (kind === "repl") {
    return (
      <Alert>
        <Copy aria-hidden="true" />
        <AlertTitle>
          Replication role: uses publications, not table grants
        </AlertTitle>
        <AlertDescription>
          Streaming and logical replication are configured via CREATE
          PUBLICATION and CREATE SUBSCRIPTION, not GRANT. Per-object grants are
          not how access is controlled for this role.
        </AlertDescription>
      </Alert>
    );
  }
  return null;
}

// Resolves the non-data states (no databases / loading / error). Returns null
// once grants are ready to render.
function grantsLoadState({
  databaseName,
  databases,
  error,
  isPending,
}: {
  databaseName: string | undefined;
  databases: { id: string; name: string }[];
  error: unknown;
  isPending: boolean;
}): ReactNode {
  if (databases.length === 0) {
    return (
      <EmptyState
        description="This instance has no databases to inspect for object privileges."
        icon={Database}
        title="No databases"
      />
    );
  }
  if (isPending) {
    return <p className="text-muted-foreground text-sm">Loading grants…</p>;
  }
  if (error) {
    return (
      <p className="text-destructive text-sm">
        Could not load grants for{" "}
        <span className="font-mono">{databaseName}</span>.
      </p>
    );
  }
  return null;
}

// ───────── Top-level Grants tab ─────────

// Persistent header: the summary lede (overview) or back affordance (drill-in)
// on the left, paired with the database picker on the right. Stays mounted
// across every view so the database can always be changed.
function GrantsTopBar({
  databases,
  grantsPartial,
  kind,
  left,
  objects,
  onSelectDatabase,
  selectedDatabaseId,
  showBadge,
}: {
  databases: { id: string; name: string }[];
  grantsPartial: boolean;
  kind: RoleKind;
  left: ReactNode;
  objects: GrantedObject[];
  onSelectDatabase: (value: string) => void;
  selectedDatabaseId: string | undefined;
  showBadge: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1">{left}</div>
      {databases.length > 0 ? (
        <div className="flex shrink-0 items-center gap-2">
          {showBadge && !grantsPartial ? (
            <HeadlineBadge kind={kind} objects={objects} />
          ) : null}
          <DatabaseSelect
            databases={databases}
            onChange={onSelectDatabase}
            value={selectedDatabaseId}
          />
        </div>
      ) : null}
    </div>
  );
}

// Header-left content: the summary lede on the overview, a back affordance on a
// drill-in, nothing while loading.
function GrantsHeaderLeft({
  defaultRules,
  grantsPartial,
  isOverview,
  loading,
  onBack,
  ownedObjects,
  publicObjects,
  schemaIndex,
  totalDirect,
}: {
  defaultRules: DefaultPrivilegeRule[];
  grantsPartial: boolean;
  isOverview: boolean;
  loading: boolean;
  onBack: () => void;
  ownedObjects: OwnedObject[];
  publicObjects: GrantedObject[];
  schemaIndex: SchemaGrantGroup[];
  totalDirect: number;
}) {
  if (loading) {
    return null;
  }
  if (!isOverview) {
    return <BackBar onBack={onBack} />;
  }
  const schemaCount = schemaIndex.filter((group) => !group.database).length;
  const indirectPaths =
    (ownedObjects.length > 0 ? 1 : 0) +
    (defaultRules.length > 0 ? 1 : 0) +
    (publicObjects.length > 0 ? 1 : 0);
  return (
    <OverviewLede
      grantsPartial={grantsPartial}
      indirectPaths={indirectPaths}
      schemaCount={schemaCount}
      totalDirect={totalDirect}
    />
  );
}

// Picks the view for the resolved drill-in selection.
function GrantsViewBody({
  databaseName,
  defaultPrivilegesPartial,
  defaultRules,
  facetStates,
  grantsPartial,
  kind,
  objects,
  onNavigateGrants,
  ownedObjects,
  ownedPartial,
  publicObjects,
  publicGrantsPartial,
  roleName,
  schemaGroup,
  schemaIndex,
  view,
}: {
  databaseName: string | undefined;
  defaultPrivilegesPartial: boolean;
  defaultRules: DefaultPrivilegeRule[];
  facetStates: FacetStates;
  grantsPartial: boolean;
  kind: RoleKind;
  objects: GrantedObject[];
  onNavigateGrants: (next: GrantsView) => void;
  ownedObjects: OwnedObject[];
  ownedPartial: boolean;
  publicObjects: GrantedObject[];
  publicGrantsPartial: boolean;
  roleName: string;
  schemaGroup: SchemaGrantGroup | null;
  schemaIndex: SchemaGrantGroup[];
  view: GrantsView;
}) {
  if (view.kind === "schema" && schemaGroup) {
    return (
      <SchemaGrantsView
        databaseName={databaseName}
        group={schemaGroup}
        onNavigate={onNavigateGrants}
        partial={grantsPartial}
        type={view.type}
      />
    );
  }
  if (view.kind === "schema") {
    return (
      <GrantsEmptyState title="Grant results are incomplete">
        {`${view.schema} is not shown in the available direct grant results.`}
      </GrantsEmptyState>
    );
  }
  if (view.kind === "reach" && view.reach === "owns") {
    return (
      <OwnsGrantsView
        databaseName={databaseName}
        directGrants={objects}
        kind={kind}
        ownedObjects={ownedObjects}
        partial={ownedPartial}
        roleName={roleName}
      />
    );
  }
  if (view.kind === "reach" && view.reach === "defaults") {
    return (
      <DefaultsDrillView
        partial={defaultPrivilegesPartial}
        rules={defaultRules}
      />
    );
  }
  if (view.kind === "reach" && view.reach === "public") {
    return (
      <PublicDrillView objects={publicObjects} partial={publicGrantsPartial} />
    );
  }
  return (
    <GrantsOverview
      databaseName={databaseName}
      defaultPrivilegesPartial={defaultPrivilegesPartial}
      defaultRules={defaultRules}
      facetStates={facetStates}
      grantsPartial={grantsPartial}
      objects={objects}
      onNavigate={onNavigateGrants}
      ownedObjects={ownedObjects}
      ownedPartial={ownedPartial}
      publicGrantsPartial={publicGrantsPartial}
      publicObjects={publicObjects}
      schemaIndex={schemaIndex}
    />
  );
}

function GrantsSection({
  builtinInfo,
  databaseName,
  databases,
  defaultPrivilegesPartial,
  defaultPrivileges,
  error,
  facetStates,
  grantsPartial,
  grantsView,
  isPending,
  kind,
  objects,
  onNavigateGrants,
  onSelectDatabase,
  ownedObjects,
  ownedPartial,
  publicGrants,
  publicGrantsPartial,
  roleName,
  selectedDatabaseId,
}: {
  builtinInfo: PredefinedRoleInfo | null;
  databaseName: string | undefined;
  databases: { id: string; name: string }[];
  defaultPrivilegesPartial: boolean;
  defaultPrivileges: RoleDefaultPrivilege[];
  error: unknown;
  facetStates: FacetStates;
  grantsPartial: boolean;
  grantsView: GrantsView;
  isPending: boolean;
  kind: RoleKind;
  objects: GrantedObject[];
  onNavigateGrants: (next: GrantsView) => void;
  onSelectDatabase: (value: string) => void;
  ownedObjects: OwnedObject[];
  ownedPartial: boolean;
  publicGrants: ObjectGrant[];
  publicGrantsPartial: boolean;
  roleName: string;
  selectedDatabaseId: string | undefined;
}) {
  const loadState = grantsLoadState({
    databaseName,
    databases,
    error,
    isPending,
  });
  const publicObjects = aggregateGrants(publicGrants);
  const defaultRules = groupDefaultPrivileges(defaultPrivileges);
  const schemaIndex = buildSchemaIndex(objects);

  // A missing schema is stale only when the result is complete. Partial results
  // keep the deep link and explain that its rows may be beyond the first page.
  const requestedSchema =
    grantsView.kind === "schema" ? grantsView.schema : null;
  const schemaGroup =
    requestedSchema == null
      ? null
      : (schemaIndex.find(
          (group) =>
            group.schema === requestedSchema ||
            (group.database && databaseName === requestedSchema)
        ) ?? null);
  const view: GrantsView =
    requestedSchema != null && schemaGroup == null && !grantsPartial
      ? { kind: "overview" }
      : grantsView;
  const isOverview = view.kind === "overview";
  const showOverviewChrome = isOverview && !loadState;

  return (
    <div className="flex flex-col gap-6">
      <GrantsTopBar
        databases={databases}
        grantsPartial={grantsPartial}
        kind={kind}
        left={
          <GrantsHeaderLeft
            defaultRules={defaultRules}
            grantsPartial={grantsPartial}
            isOverview={isOverview}
            loading={Boolean(loadState)}
            onBack={() => onNavigateGrants({ kind: "overview" })}
            ownedObjects={ownedObjects}
            publicObjects={publicObjects}
            schemaIndex={schemaIndex}
            totalDirect={objects.length}
          />
        }
        objects={objects}
        onSelectDatabase={onSelectDatabase}
        selectedDatabaseId={selectedDatabaseId}
        showBadge={showOverviewChrome}
      />
      {showOverviewChrome ? (
        <CharacterBanner
          builtinInfo={builtinInfo}
          kind={kind}
          roleName={roleName}
        />
      ) : null}
      {showOverviewChrome && kind === "group" ? (
        <p className="text-muted-foreground text-sm">
          This role can&apos;t log in; its members inherit these grants.
        </p>
      ) : null}
      {loadState ?? (
        <GrantsViewBody
          databaseName={databaseName}
          defaultPrivilegesPartial={defaultPrivilegesPartial}
          defaultRules={defaultRules}
          facetStates={facetStates}
          grantsPartial={grantsPartial}
          kind={kind}
          objects={objects}
          onNavigateGrants={onNavigateGrants}
          ownedObjects={ownedObjects}
          ownedPartial={ownedPartial}
          publicGrantsPartial={publicGrantsPartial}
          publicObjects={publicObjects}
          roleName={roleName}
          schemaGroup={schemaGroup}
          schemaIndex={schemaIndex}
          view={view}
        />
      )}
    </div>
  );
}

export { DatabaseSelect, GrantsSection };
