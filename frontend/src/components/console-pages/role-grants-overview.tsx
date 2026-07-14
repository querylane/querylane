"use client";

import {
  ChevronRight,
  Clock,
  Crown,
  Database,
  FolderTree,
  Globe,
} from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import type { GrantsView } from "@/components/console-pages/role-detail-search";
import {
  CountPill,
  GrantsEmptyState,
} from "@/components/console-pages/role-grants-pills";
import {
  DEFAULT_PRIV_OBJECT_LABEL,
  type DefaultPrivilegeRule,
  EXAMPLE_LIMIT,
  type FacetState,
  type FacetStates,
  type GrantedObject,
  ownedStats,
  type SchemaGrantGroup,
  schemaBreakdownLabel,
  TABLE_LIKE_TYPES,
} from "@/components/console-pages/role-grants-shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  GrantObjectType,
  type OwnedObject,
} from "@/protogen/querylane/console/v1alpha1/role_pb";

// Em dash as a JS expression (not JSX text) so it renders as the "no value"
// glyph without tripping the no-em-dash-in-prose lint.
const EM_DASH = "—";
type LoadedFacetState = Exclude<FacetState, "idle">;

function loadedFacetState(state: FacetState): LoadedFacetState {
  return state === "idle" ? "loading" : state;
}

// ───────── Reach-row preview strings ─────────

function ownsPreview(objects: OwnedObject[]): string {
  if (objects.length === 0) {
    return "Nothing owned in this database.";
  }
  const breakdown = ownedStats(objects)
    .map((stat) => `${stat.count.toLocaleString()} ${stat.label}`)
    .join(" · ");
  const schemas = new Set<string>();
  for (const object of objects) {
    if (object.schemaName) {
      schemas.add(object.schemaName);
    }
  }
  const schemaList = Array.from(schemas).toSorted((a, b) => a.localeCompare(b));
  if (schemaList.length === 0) {
    return breakdown;
  }
  const shown = schemaList.slice(0, EXAMPLE_LIMIT - 1).join(", ");
  const extra = schemaList.length - (EXAMPLE_LIMIT - 1);
  return `${breakdown} in ${extra > 0 ? `${shown} +${extra}` : shown}`;
}

function defaultsPreview(rules: DefaultPrivilegeRule[]): string {
  const [first] = rules;
  if (!first) {
    return "No future-grant rules.";
  }
  const label = DEFAULT_PRIV_OBJECT_LABEL[first.objectType];
  return `${rules.length} rule${rules.length === 1 ? "" : "s"} — when ${first.creatorRoleName} creates new ${label} in ${first.schemaName || "any schema"}…`;
}

function publicPreview(objects: GrantedObject[]): string {
  if (objects.length === 0) {
    return "No PUBLIC grants visible.";
  }
  const tableObjects = objects.filter((object) =>
    TABLE_LIKE_TYPES.has(object.objectType)
  );
  const schemaObjects = objects.filter(
    (object) => object.objectType === GrantObjectType.SCHEMA
  );
  const parts: string[] = [];
  if (tableObjects.length > 0) {
    const count = tableObjects.length;
    parts.push(
      `${publicPrivilegeSummary(tableObjects)} on ${count} table${count === 1 ? "" : "s"}`
    );
  }
  if (schemaObjects.length > 0) {
    const count = schemaObjects.length;
    parts.push(
      `${publicPrivilegeSummary(schemaObjects)} on ${count} schema${count === 1 ? "" : "s"}`
    );
  }
  const detail = parts.length > 0 ? ` — ${parts.join(", ")}` : "";
  return `${objects.length} grant${objects.length === 1 ? "" : "s"}${detail}`;
}

function publicPrivilegeSummary(objects: GrantedObject[]): string {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const object of objects) {
    for (const privilege of object.privileges) {
      if (!seen.has(privilege.name)) {
        seen.add(privilege.name);
        names.push(privilege.name);
      }
    }
  }
  if (names.length === 0) {
    return "Privileges";
  }
  if (names.length <= 2) {
    return names.join(", ");
  }
  return `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
}

// ───────── Section + rows ─────────

function SectionHead({
  count,
  hint,
  partial = false,
  title,
}: {
  count?: number;
  hint?: string;
  partial?: boolean;
  title: string;
}) {
  return (
    <div className="flex items-baseline gap-2.5 px-0.5">
      <span className="font-semibold text-foreground text-sm">{title}</span>
      {count === undefined ? null : (
        <CountPill partial={partial} value={count} />
      )}
      {hint ? (
        <span className="ml-auto text-[11.5px] text-muted-foreground">
          {hint}
        </span>
      ) : null}
    </div>
  );
}

function TotalBadge({
  partial = false,
  unit,
  value,
}: {
  partial?: boolean;
  unit: string;
  value: number;
}) {
  return (
    <span className="flex flex-col items-end whitespace-nowrap">
      <span className="font-medium font-mono text-[15px] text-foreground leading-tight tracking-tight">
        {value.toLocaleString()}
      </span>
      <span className="flex items-center gap-1 text-[10.5px] text-muted-foreground">
        <span>
          {unit}
          {value === 1 ? "" : "s"}
        </span>
        {partial ? <span>Partial</span> : null}
      </span>
    </span>
  );
}

function DrillRow({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <Button
      className="group h-auto w-full items-center justify-start gap-3.5 rounded-none border-0 border-border not-first:border-t px-4 py-3.5 font-normal hover:bg-foreground/[0.03]"
      onClick={onClick}
      type="button"
      variant="ghost"
    >
      {children}
      <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
    </Button>
  );
}

function SchemaListRow({
  databaseName,
  group,
  onNavigate,
  partial,
}: {
  databaseName: string | undefined;
  group: SchemaGrantGroup;
  onNavigate: (next: GrantsView) => void;
  partial: boolean;
}) {
  const Icon = group.database ? Database : FolderTree;
  const name = group.database
    ? (databaseName ?? "Database scope")
    : group.schema;
  const targetSchema = group.database
    ? (databaseName ?? group.schema)
    : group.schema;
  return (
    <DrillRow
      onClick={() => onNavigate({ kind: "schema", schema: targetSchema })}
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
        <span className="truncate font-medium font-mono text-[13.5px] text-foreground">
          {name}
        </span>
        <span className="truncate text-muted-foreground text-xs">
          {partial
            ? "Available direct grant results"
            : schemaBreakdownLabel(group)}
        </span>
      </span>
      <TotalBadge partial={partial} unit="grant" value={group.total} />
    </DrillRow>
  );
}

function ReachRow({
  count,
  desc,
  icon: Icon,
  iconClassName,
  name,
  onClick,
  partial,
  state,
  unit,
}: {
  count: number;
  desc: string;
  icon: ComponentType<{ className?: string }>;
  iconClassName: string;
  name: string;
  onClick: () => void;
  partial: boolean;
  state: LoadedFacetState;
  unit: string;
}) {
  // A failed/pending facet shows its own state rather than its empty-state preview
  // (which would read as a definitive "nothing here").
  let detail = desc;
  if (state === "error") {
    detail = "Couldn't load — data unavailable";
  } else if (state === "loading") {
    detail = "Loading...";
  }
  let total: ReactNode = (
    <span className="font-mono text-muted-foreground/50 text-sm">
      {EM_DASH}
    </span>
  );
  if (state === "ready" && count > 0) {
    total = <TotalBadge partial={partial} unit={unit} value={count} />;
  } else if (state !== "ready") {
    total = null;
  }
  return (
    <DrillRow onClick={onClick}>
      <Icon className={cn("size-4 shrink-0", iconClassName)} />
      <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
        <span className="truncate font-medium font-sans text-[13.5px] text-foreground">
          {name}
        </span>
        <span
          className={cn(
            "truncate text-xs",
            state === "error" ? "text-destructive/80" : "text-muted-foreground"
          )}
        >
          {detail}
        </span>
      </span>
      {total}
    </DrillRow>
  );
}

// ───────── Overview ─────────

function DirectGrantsLede({
  grantsPartial,
  schemaCount,
  totalDirect,
}: {
  grantsPartial: boolean;
  schemaCount: number;
  totalDirect: number;
}) {
  if (totalDirect === 0) {
    return grantsPartial
      ? "No direct grants are shown in the available results."
      : "No direct grants in this database.";
  }
  return (
    <>
      <strong className="font-medium text-foreground">
        {totalDirect.toLocaleString()}
      </strong>{" "}
      {grantsPartial ? "available direct grant" : "direct grant"}
      {totalDirect === 1 ? "" : "s"}
      {schemaCount > 0 ? (
        <>
          {" "}
          {grantsPartial ? (
            "across available schemas"
          ) : (
            <>
              across{" "}
              <strong className="font-medium text-foreground">
                {schemaCount.toLocaleString()}
              </strong>{" "}
              schema{schemaCount === 1 ? "" : "s"}
            </>
          )}
        </>
      ) : null}
      {grantsPartial ? (
        <span className="font-medium text-foreground"> · Partial</span>
      ) : null}
      .
    </>
  );
}

// The grants summary line. Lives in the tab header next to the database
// selector (which already names the database), so it doesn't repeat it.
function OverviewLede({
  grantsPartial,
  indirectPaths,
  schemaCount,
  totalDirect,
}: {
  grantsPartial: boolean;
  indirectPaths: number;
  schemaCount: number;
  totalDirect: number;
}) {
  return (
    <p className="text-muted-foreground text-sm leading-relaxed">
      <DirectGrantsLede
        grantsPartial={grantsPartial}
        schemaCount={schemaCount}
        totalDirect={totalDirect}
      />
      {indirectPaths > 0 ? (
        <>
          {" "}
          Reachable via{" "}
          <strong className="font-medium text-foreground">
            {indirectPaths}
          </strong>{" "}
          indirect path{indirectPaths === 1 ? "" : "s"}.
        </>
      ) : null}
    </p>
  );
}

function DirectGrantsSection({
  databaseName,
  grantsPartial,
  indirectPaths,
  onNavigate,
  schemaIndex,
  totalDirect,
}: {
  databaseName: string | undefined;
  grantsPartial: boolean;
  indirectPaths: number;
  onNavigate: (next: GrantsView) => void;
  schemaIndex: SchemaGrantGroup[];
  totalDirect: number;
}) {
  if (schemaIndex.length > 0) {
    const schemaCount = schemaIndex.filter((group) => !group.database).length;
    return (
      <section className="flex flex-col gap-3">
        <SectionHead
          count={totalDirect}
          hint={
            grantsPartial
              ? "Available schemas"
              : `${schemaCount} schema${schemaCount === 1 ? "" : "s"}`
          }
          partial={grantsPartial}
          title="Direct grants"
        />
        <div className="overflow-hidden rounded-md border border-border">
          {schemaIndex.map((group) => (
            <SchemaListRow
              databaseName={databaseName}
              group={group}
              key={group.database ? "__database" : group.schema}
              onNavigate={onNavigate}
              partial={grantsPartial}
            />
          ))}
        </div>
      </section>
    );
  }
  return (
    <GrantsEmptyState
      title={
        grantsPartial
          ? "Direct grant results are incomplete"
          : "No direct grants"
      }
    >
      {grantsPartial ? (
        "No direct grants are shown in the available results."
      ) : (
        <>
          This role has no explicit{" "}
          <span className="font-mono text-foreground/80">GRANT</span>s on{" "}
          <span className="font-mono text-foreground/80">{databaseName}</span>.
          {indirectPaths > 0
            ? " It may still be reachable via the indirect paths below."
            : ""}
        </>
      )}
    </GrantsEmptyState>
  );
}

function GrantsOverview({
  databaseName,
  defaultPrivilegesPartial,
  defaultRules,
  facetStates,
  grantsPartial,
  objects,
  onNavigate,
  ownedPartial,
  ownedObjects,
  publicGrantsPartial,
  publicObjects,
  schemaIndex,
}: {
  databaseName: string | undefined;
  defaultPrivilegesPartial: boolean;
  defaultRules: DefaultPrivilegeRule[];
  facetStates: FacetStates;
  grantsPartial: boolean;
  objects: GrantedObject[];
  onNavigate: (next: GrantsView) => void;
  ownedPartial: boolean;
  ownedObjects: OwnedObject[];
  publicGrantsPartial: boolean;
  publicObjects: GrantedObject[];
  schemaIndex: SchemaGrantGroup[];
}) {
  const totalDirect = objects.length;
  const indirectPaths =
    (ownedObjects.length > 0 ? 1 : 0) +
    (defaultRules.length > 0 ? 1 : 0) +
    (publicObjects.length > 0 ? 1 : 0);

  return (
    <div className="flex flex-col gap-8">
      <DirectGrantsSection
        databaseName={databaseName}
        grantsPartial={grantsPartial}
        indirectPaths={indirectPaths}
        onNavigate={onNavigate}
        schemaIndex={schemaIndex}
        totalDirect={totalDirect}
      />

      <section className="flex flex-col gap-3">
        <SectionHead
          hint="implicit & inherited paths"
          title="Also reachable via"
        />
        <div className="overflow-hidden rounded-md border border-border">
          <ReachRow
            count={ownedObjects.length}
            desc={
              ownedPartial
                ? "Available ownership results are incomplete."
                : ownsPreview(ownedObjects)
            }
            icon={Crown}
            iconClassName="text-amber-600 dark:text-amber-400"
            name="Owns"
            onClick={() => onNavigate({ kind: "reach", reach: "owns" })}
            partial={ownedPartial}
            state={loadedFacetState(facetStates.owned)}
            unit="object"
          />
          <ReachRow
            count={defaultRules.length}
            desc={
              defaultPrivilegesPartial
                ? "Available default privilege results are incomplete."
                : defaultsPreview(defaultRules)
            }
            icon={Clock}
            iconClassName="text-violet-600 dark:text-violet-300"
            name="Default privileges"
            onClick={() => onNavigate({ kind: "reach", reach: "defaults" })}
            partial={defaultPrivilegesPartial}
            state={loadedFacetState(facetStates.defaults)}
            unit="rule"
          />
          <ReachRow
            count={publicObjects.length}
            desc={
              publicGrantsPartial
                ? "Available PUBLIC grant results are incomplete."
                : publicPreview(publicObjects)
            }
            icon={Globe}
            iconClassName="text-sky-600 dark:text-sky-400"
            name="Granted to PUBLIC"
            onClick={() => onNavigate({ kind: "reach", reach: "public" })}
            partial={publicGrantsPartial}
            state={loadedFacetState(facetStates.publicGrants)}
            unit="grant"
          />
        </div>
      </section>
    </div>
  );
}

export { GrantsOverview, OverviewLede };
