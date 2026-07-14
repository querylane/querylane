"use client";

import { ChevronRight, FolderTree, Search } from "lucide-react";
import {
  type ComponentType,
  type ReactNode,
  useReducer,
  useState,
} from "react";
import {
  DensityStrip,
  FilterChip,
  HeldPillStrip,
} from "@/components/console-pages/role-grants-pills";
import {
  AUTO_EXPAND_THRESHOLD,
  columnsFor,
  dedupePrivileges,
  densityCounts,
  dominantGrantor,
  FLAT_TYPES,
  GRANT_GROUPS,
  GRANT_OBJECT_META,
  type GrantedObject,
  grantorSummary,
  groupBySchema,
  MAX_SAMPLE_ROWS,
  objectDisplayName,
  objectMatchesFilters,
  privAbbr,
  RELATION_TYPES,
  TYPE_UNIT,
} from "@/components/console-pages/role-grants-shared";
import { SearchEmptyState } from "@/components/search-empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { allPredicates } from "@/lib/predicates";
import { cn } from "@/lib/utils";
import { GrantObjectType } from "@/protogen/querylane/console/v1alpha1/role_pb";

function GrantRowName({ object }: { object: GrantedObject }) {
  if (RELATION_TYPES.has(object.objectType) && object.schemaName) {
    return (
      <span className="truncate font-mono text-[12.5px]">
        <span className="text-muted-foreground">{object.schemaName}.</span>
        {object.objectName}
      </span>
    );
  }
  return (
    <span className="truncate font-mono text-[12.5px]">
      {objectDisplayName(object)}
    </span>
  );
}

// One object in an expanded schema — names-only, click to reveal its detail.
function ObjectRow({
  columns,
  object,
}: {
  columns: string[];
  object: GrantedObject;
}) {
  const [open, setOpen] = useState(false);
  const privileges = dedupePrivileges(object.privileges);
  const heldCount = privileges.length;
  const grantCount = privileges.filter((p) => p.grantable).length;
  const grantor = grantorSummary(object.grantors);
  return (
    <div className={cn("rounded-sm", open && "bg-foreground/[0.02]")}>
      <Button
        aria-expanded={open}
        className="h-auto w-full items-center justify-start gap-2 rounded-sm px-1.5 py-1 font-normal hover:bg-foreground/[0.03]"
        onClick={() => setOpen(!open)}
        type="button"
        variant="ghost"
      >
        <ChevronRight
          className={cn(
            "size-3 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-90"
          )}
        />
        <GrantRowName object={object} />
        <span className="ml-auto shrink-0 whitespace-nowrap font-mono text-[11px] text-muted-foreground">
          {heldCount} priv{heldCount === 1 ? "" : "s"}
          {grantCount > 0 ? (
            <span className="text-amber-600/90 dark:text-amber-400/90">
              {" "}
              · {grantCount}+
            </span>
          ) : null}
        </span>
      </Button>
      {open ? (
        <div className="mt-1 flex flex-col gap-1.5 border-border/60 border-t border-dashed py-2 pr-1.5 pl-[26px]">
          <div className="grid grid-cols-[90px_1fr] items-center gap-3 text-[11.5px]">
            <span className="text-[11px] text-muted-foreground">
              privileges
            </span>
            <HeldPillStrip columns={columns} object={object} />
          </div>
          {grantor ? (
            <div className="grid grid-cols-[90px_1fr] items-center gap-3 text-[11.5px]">
              <span className="text-[11px] text-muted-foreground">
                granted by
              </span>
              <span
                className="font-mono text-[12px] text-foreground/85"
                title={grantor.title}
              >
                {grantor.text}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// Inline filter bar for a large schema: scoped search + privilege chips.
function SchemaFilterBar({
  columns,
  counts,
  filterActive,
  grantOnly,
  matchCount,
  onClear,
  onToggleGrant,
  onTogglePriv,
  privFilter,
  schema,
  search,
  setSearch,
  total,
  unit,
}: {
  columns: string[];
  counts: Record<string, number>;
  filterActive: boolean;
  grantOnly: boolean;
  matchCount: number;
  onClear: () => void;
  onToggleGrant: () => void;
  onTogglePriv: (name: string) => void;
  privFilter: Record<string, boolean>;
  schema: string;
  search: string;
  setSearch: (value: string) => void;
  total: number;
  unit: string;
}) {
  return (
    <div className="mb-1 flex flex-col gap-1.5 border-border border-b px-1.5 pt-1.5 pb-2">
      <div className="relative w-full max-w-sm">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          aria-label={`Filter ${unit}s in ${schema}`}
          className="h-7 pl-8 font-mono text-xs"
          name={`grant-filter-${schema}`}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={`Filter ${total.toLocaleString()} ${unit}s in ${schema}…`}
          value={search}
        />
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {columns.map((name) => {
          if ((counts[name] ?? 0) === 0) {
            return null;
          }
          return (
            <FilterChip
              active={Boolean(privFilter[name])}
              key={name}
              label={privAbbr(name)}
              onToggle={() => onTogglePriv(name)}
            />
          );
        })}
        <FilterChip
          active={grantOnly}
          label="+ grant"
          onToggle={onToggleGrant}
        />
        {filterActive ? (
          <Button
            className="h-[22px] px-2 font-normal text-muted-foreground text-xs"
            onClick={onClear}
            size="xs"
            type="button"
            variant="ghost"
          >
            clear
          </Button>
        ) : null}
        {filterActive ? (
          <span className="ml-auto font-mono text-[10.5px] text-muted-foreground tracking-[0.02em]">
            {matchCount.toLocaleString()} match{matchCount === 1 ? "" : "es"}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function SchemaSectionHeader({
  columns,
  counts,
  grantor,
  objects,
  onToggle,
  open,
  schema,
  unit,
}: {
  columns: string[];
  counts: Record<string, number>;
  grantor: string | null;
  objects: GrantedObject[];
  onToggle: () => void;
  open: boolean;
  schema: string;
  unit: string;
}) {
  return (
    <Button
      aria-expanded={open}
      className="h-auto w-full items-center justify-start gap-3 rounded-sm px-1 py-1.5 font-normal hover:bg-foreground/[0.03]"
      onClick={onToggle}
      type="button"
      variant="ghost"
    >
      <ChevronRight
        className={cn(
          "size-3 shrink-0 text-muted-foreground transition-transform",
          open && "rotate-90"
        )}
      />
      <FolderTree className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="flex min-w-0 flex-col items-start">
        <span className="truncate font-medium font-mono text-[13px] leading-tight">
          {schema}
        </span>
        {grantor ? (
          <span className="truncate text-[10.5px] text-muted-foreground leading-tight">
            granted by{" "}
            <span className="font-mono text-[11px] text-foreground/75">
              {grantor}
            </span>
          </span>
        ) : null}
      </span>
      <span className="ml-auto shrink-0 whitespace-nowrap font-mono text-[11.5px] text-foreground/[0.78] tracking-[0.02em]">
        <span className="font-medium">{objects.length.toLocaleString()}</span>
        <span className="ml-1 font-normal text-muted-foreground">
          {unit}
          {objects.length === 1 ? "" : "s"}
        </span>
      </span>
      <DensityStrip columns={columns} counts={counts} total={objects.length} />
    </Button>
  );
}

function SchemaSectionBody({
  columns,
  counts,
  filterActive,
  filtered,
  grantOnly,
  isLarge,
  objects,
  onClear,
  onToggleGrant,
  onTogglePriv,
  privFilter,
  sample,
  schema,
  search,
  setSearch,
  setShowAll,
  showAll,
  unit,
}: {
  columns: string[];
  counts: Record<string, number>;
  filterActive: boolean;
  filtered: GrantedObject[];
  grantOnly: boolean;
  isLarge: boolean;
  objects: GrantedObject[];
  onClear: () => void;
  onToggleGrant: () => void;
  onTogglePriv: (name: string) => void;
  privFilter: Record<string, boolean>;
  sample: GrantedObject[];
  schema: string;
  search: string;
  setSearch: (value: string) => void;
  setShowAll: (value: boolean) => void;
  showAll: boolean;
  unit: string;
}) {
  const overflow = filtered.length - sample.length;
  const hasOverflow = filtered.length > MAX_SAMPLE_ROWS;
  return (
    <div className="flex flex-col pb-2 pl-[26px]">
      {isLarge ? (
        <SchemaFilterBar
          columns={columns}
          counts={counts}
          filterActive={filterActive}
          grantOnly={grantOnly}
          matchCount={filtered.length}
          onClear={onClear}
          onToggleGrant={onToggleGrant}
          onTogglePriv={onTogglePriv}
          privFilter={privFilter}
          schema={schema}
          search={search}
          setSearch={setSearch}
          total={objects.length}
          unit={unit}
        />
      ) : null}
      {sample.length === 0 ? (
        <SearchEmptyState
          className="min-h-16 py-3.5"
          resourceName={`${unit}s`}
        />
      ) : null}
      {sample.map((object) => (
        <ObjectRow columns={columns} key={object.key} object={object} />
      ))}
      {hasOverflow ? (
        <Button
          className="h-auto justify-start self-start px-1.5 pt-1.5 pb-1 font-normal text-muted-foreground text-xs underline-offset-2 hover:text-foreground hover:underline"
          onClick={() => setShowAll(!showAll)}
          size="sm"
          type="button"
          variant="link"
        >
          {showAll
            ? "Show fewer"
            : `Show all ${filtered.length.toLocaleString()} ${unit}s${filterActive ? " matching filters" : ""}`}
          {allPredicates(
            () => !showAll,
            () => overflow > 0
          ) ? (
            <span className="ml-1.5 text-muted-foreground/70">
              · +{overflow.toLocaleString()} hidden
            </span>
          ) : null}
        </Button>
      ) : null}
    </div>
  );
}

// All of a schema section's view state lives in one reducer: its
// expand/filter/search controls move together, so a single dispatch keeps
// updates consistent (and avoids stale-closure spreads on the privilege map).
interface SchemaSectionState {
  grantOnly: boolean;
  open: boolean;
  privFilter: Record<string, boolean>;
  search: string;
  showAll: boolean;
}

type SchemaSectionAction =
  | { type: "clearFilters" }
  | { type: "setSearch"; value: string }
  | { type: "setShowAll"; value: boolean }
  | { type: "toggleGrantOnly" }
  | { type: "toggleOpen" }
  | { name: string; type: "togglePriv" };

function schemaSectionReducer(
  state: SchemaSectionState,
  action: SchemaSectionAction
): SchemaSectionState {
  switch (action.type) {
    case "toggleOpen":
      return { ...state, open: !state.open };
    case "setSearch":
      return { ...state, search: action.value };
    case "togglePriv":
      return {
        ...state,
        privFilter: {
          ...state.privFilter,
          [action.name]: !state.privFilter[action.name],
        },
      };
    case "toggleGrantOnly":
      return { ...state, grantOnly: !state.grantOnly };
    case "setShowAll":
      return { ...state, showAll: action.value };
    case "clearFilters":
      return { ...state, grantOnly: false, privFilter: {}, search: "" };
    default:
      return state;
  }
}

// One schema within a schema-grouped object type. Header carries the density
// rollup; the body reveals object rows (with an inline filter bar when large).
function SchemaSection({
  columns,
  defaultOpen,
  objects,
  schema,
  type,
}: {
  columns: string[];
  defaultOpen: boolean;
  objects: GrantedObject[];
  schema: string;
  type: GrantObjectType;
}) {
  const [state, dispatch] = useReducer(schemaSectionReducer, {
    grantOnly: false,
    open: defaultOpen,
    privFilter: {},
    search: "",
    showAll: false,
  });
  const { grantOnly, open, privFilter, search, showAll } = state;

  const counts = densityCounts(objects, columns);
  const grantor = dominantGrantor(objects);
  const unit = TYPE_UNIT[type] ?? "object";
  const isLarge = objects.length > AUTO_EXPAND_THRESHOLD;

  const activePrivs = Object.keys(privFilter).filter(
    (name) => privFilter[name]
  );
  const needle = search.trim().toLowerCase();
  const filterActive = needle.length > 0 || grantOnly || activePrivs.length > 0;
  const filtered = objects.filter((object) =>
    objectMatchesFilters({ object, needle, grantOnly, activePrivs })
  );
  const sample = showAll ? filtered : filtered.slice(0, MAX_SAMPLE_ROWS);

  return (
    <div className="pl-9">
      <SchemaSectionHeader
        columns={columns}
        counts={counts}
        grantor={grantor}
        objects={objects}
        onToggle={() => dispatch({ type: "toggleOpen" })}
        open={open}
        schema={schema}
        unit={unit}
      />
      {open ? (
        <SchemaSectionBody
          columns={columns}
          counts={counts}
          filterActive={filterActive}
          filtered={filtered}
          grantOnly={grantOnly}
          isLarge={isLarge}
          objects={objects}
          onClear={() => dispatch({ type: "clearFilters" })}
          onToggleGrant={() => dispatch({ type: "toggleGrantOnly" })}
          onTogglePriv={(name) => dispatch({ name, type: "togglePriv" })}
          privFilter={privFilter}
          sample={sample}
          schema={schema}
          search={search}
          setSearch={(value) => dispatch({ type: "setSearch", value })}
          setShowAll={(value) => dispatch({ type: "setShowAll", value })}
          showAll={showAll}
          unit={unit}
        />
      ) : null}
    </div>
  );
}

function GroupHeader({
  count,
  density,
  icon: Icon,
  onToggle,
  open,
  title,
}: {
  count: number;
  density: ReactNode;
  icon: ComponentType<{ className?: string }>;
  onToggle: () => void;
  open: boolean;
  title: string;
}) {
  return (
    <Button
      aria-expanded={open}
      className="h-auto w-full items-center justify-start gap-2.5 rounded-none px-1 py-2.5 font-normal hover:bg-foreground/[0.02]"
      onClick={onToggle}
      type="button"
      variant="ghost"
    >
      <ChevronRight
        className={cn(
          "size-3.5 shrink-0 text-muted-foreground transition-transform",
          open && "rotate-90"
        )}
      />
      <span className="flex size-[22px] shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground">
        <Icon className="size-3.5" />
      </span>
      <span className="font-medium text-sm">{title}</span>
      <span className="font-mono text-[11px] text-muted-foreground tracking-[0.04em]">
        {count.toLocaleString()}
      </span>
      <span className="ml-auto flex items-center">{density}</span>
    </Button>
  );
}

// Schema-grouped object type (tables / views / sequences / functions …).
function SchemaGroupedGroup({
  objects,
  title,
  type,
}: {
  objects: GrantedObject[];
  title: string;
  type: GrantObjectType;
}) {
  const [open, setOpen] = useState(true);
  const meta =
    GRANT_OBJECT_META[type] ?? GRANT_OBJECT_META[GrantObjectType.UNSPECIFIED];
  const columns = columnsFor(type, objects);
  const counts = densityCounts(objects, columns);
  const bySchema = groupBySchema(objects);
  return (
    <div className="border-border border-t">
      <GroupHeader
        count={objects.length}
        density={
          <DensityStrip
            columns={columns}
            counts={counts}
            total={objects.length}
          />
        }
        icon={meta.icon}
        onToggle={() => setOpen(!open)}
        open={open}
        title={title}
      />
      {open ? (
        <div className="flex flex-col pb-1.5">
          {bySchema.map(([schema, schemaObjects]) => (
            <SchemaSection
              columns={columns}
              defaultOpen={schemaObjects.length <= AUTO_EXPAND_THRESHOLD}
              key={schema}
              objects={schemaObjects}
              schema={schema}
              type={type}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

// Flat object type (database / schemas) — rows are the objects themselves.
function FlatGroup({
  objects,
  title,
  type,
}: {
  objects: GrantedObject[];
  title: string;
  type: GrantObjectType;
}) {
  const [open, setOpen] = useState(true);
  const meta =
    GRANT_OBJECT_META[type] ?? GRANT_OBJECT_META[GrantObjectType.UNSPECIFIED];
  const columns = columnsFor(type, objects);
  const counts = densityCounts(objects, columns);
  return (
    <div className="border-border border-t">
      <GroupHeader
        count={objects.length}
        density={
          <DensityStrip
            columns={columns}
            counts={counts}
            total={objects.length}
          />
        }
        icon={meta.icon}
        onToggle={() => setOpen(!open)}
        open={open}
        title={title}
      />
      {open ? (
        <div className="flex flex-col pb-1.5 pl-9">
          {objects.map((object) => {
            const grantor = grantorSummary(object.grantors);
            return (
              <div
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-sm p-1.5 hover:bg-foreground/[0.03]"
                key={object.key}
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-mono text-[12.5px] leading-tight">
                    {objectDisplayName(object)}
                  </span>
                  {grantor ? (
                    <span
                      className="truncate text-[10.5px] text-muted-foreground leading-tight"
                      title={grantor.title}
                    >
                      granted by{" "}
                      <span className="font-mono text-[11px] text-foreground/75">
                        {grantor.text}
                      </span>
                    </span>
                  ) : null}
                </span>
                <HeldPillStrip columns={columns} object={object} />
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

// The hairline-separated list of object-type groups. Assumes objects.length > 0.
export function GrantGroups({ objects }: { objects: GrantedObject[] }) {
  const byType = new Map<GrantObjectType, GrantedObject[]>();
  for (const object of objects) {
    const list = byType.get(object.objectType);
    if (list) {
      list.push(object);
    } else {
      byType.set(object.objectType, [object]);
    }
  }
  const groups: ((typeof GRANT_GROUPS)[number] & {
    objects: GrantedObject[];
  })[] = [];
  for (const group of GRANT_GROUPS) {
    const groupObjects = byType.get(group.type) ?? [];
    if (groupObjects.length > 0) {
      groups.push({ ...group, objects: groupObjects });
    }
  }

  return (
    <div className="border-border border-b">
      {groups.map((group) =>
        FLAT_TYPES.has(group.type) ? (
          <FlatGroup
            key={group.type}
            objects={group.objects}
            title={group.title}
            type={group.type}
          />
        ) : (
          <SchemaGroupedGroup
            key={group.type}
            objects={group.objects}
            title={group.title}
            type={group.type}
          />
        )
      )}
    </div>
  );
}
