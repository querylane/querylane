"use client";

import type { RowData, SortingState } from "@tanstack/react-table";
import { useDeferredValue } from "react";
import { HeldPillStrip } from "@/components/console-pages/role-grants-pills";
import {
  columnsFor,
  GRANT_OBJECT_META,
  type GrantedObject,
  grantorSummary,
  OBJECT_TYPE_LABEL,
  objectDisplayName,
  RELATION_TYPES,
  slugForObjectType,
} from "@/components/console-pages/role-grants-shared";
import {
  DataTable,
  type DataTableColumnDef,
  DataTableFilter,
  SortableHeader,
} from "@/components/ui/data-table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GrantObjectType } from "@/protogen/querylane/console/v1alpha1/role_pb";

// Object types in the order their tabs appear, matching the Owns view.
const GRANT_TYPE_ORDER: GrantObjectType[] = [
  GrantObjectType.DATABASE,
  GrantObjectType.SCHEMA,
  GrantObjectType.TABLE,
  GrantObjectType.VIEW,
  GrantObjectType.MATERIALIZED_VIEW,
  GrantObjectType.SEQUENCE,
  GrantObjectType.FOREIGN_TABLE,
  GrantObjectType.FUNCTION,
  GrantObjectType.LARGE_OBJECT,
];

const GRANT_PAGE_SIZE = 15;
// Em dash as a JS expression (not JSX text) so it renders as the "no value"
// glyph without tripping the no-em-dash-in-prose lint.
const EM_DASH = "—";

// Schema-dimmed object name (e.g. "public.orders") for relation rows; bare name
// for schema- and database-level grants.
function ObjectNameCell({ object }: { object: GrantedObject }) {
  const showSchema =
    RELATION_TYPES.has(object.objectType) && Boolean(object.schemaName);
  return (
    <span className="font-mono text-[13px] text-foreground">
      {showSchema ? (
        <>
          <span className="text-muted-foreground">{object.schemaName}.</span>
          {object.objectName}
        </>
      ) : (
        objectDisplayName(object)
      )}
    </span>
  );
}

function GrantorCell({ object }: { object: GrantedObject }) {
  const grantor = grantorSummary(object.grantors);
  if (!grantor) {
    return <span className="text-muted-foreground">{EM_DASH}</span>;
  }
  return (
    <span
      className="font-mono text-[12.5px] text-muted-foreground"
      title={grantor.title}
    >
      {grantor.text}
    </span>
  );
}

// Shared "tabbed object table" shell: line tabs (All + each present object
// type) and a search box above a single sortable, paginated DataTable. The kind
// tabs filter the rows up-front so the table only ever sorts/paginates the
// active slice — a role can hold thousands of grants, so we never render them
// all at once. Used by the Owns, schema, and PUBLIC grant views so they share
// one interaction pattern.
function KindFilteredTable<T extends RowData>({
  activeKind,
  columns,
  data,
  filterColumnId,
  initialSorting,
  kindOf,
  onKindChange,
  onSearchChange,
  pageSize,
  search,
  searchPlaceholder,
  tableKey,
  typeOrder,
}: {
  activeKind: string;
  columns: DataTableColumnDef<T>[];
  data: T[];
  filterColumnId: string;
  initialSorting: SortingState;
  kindOf: (row: T) => GrantObjectType;
  onKindChange: (slug: string) => void;
  onSearchChange: (value: string) => void;
  pageSize: number;
  search: string;
  searchPlaceholder: string;
  tableKey: string;
  typeOrder: GrantObjectType[];
}) {
  // Keep the search input urgent (always reflects the latest keystroke) while
  // deferring the expensive filtering and kind-scan to a lower-priority render.
  // This is a React Compiler–friendly INP fix: no manual useMemo/useCallback.
  const deferredSearch = useDeferredValue(search);

  const presentKinds = typeOrder.filter((type) =>
    data.some((row) => kindOf(row) === type)
  );
  const filtered =
    activeKind === "all"
      ? data
      : data.filter((row) => slugForObjectType(kindOf(row)) === activeKind);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs onValueChange={onKindChange} value={activeKind}>
          <TabsList variant="line">
            <TabsTrigger value="all">All</TabsTrigger>
            {presentKinds.map((type) => {
              const slug = slugForObjectType(type);
              const meta = GRANT_OBJECT_META[type];
              if (!slug) {
                return null;
              }
              return (
                <TabsTrigger key={type} value={slug}>
                  <meta.icon className="size-3" />
                  {OBJECT_TYPE_LABEL(type)}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>
        {/* value stays urgent so the input reflects keystrokes immediately */}
        <DataTableFilter
          onChange={onSearchChange}
          placeholder={searchPlaceholder}
          value={search}
        />
      </div>
      {/* filterValue uses the deferred term so TanStack Table re-filters at
          lower priority, keeping the input responsive on large grant lists */}
      <DataTable
        columns={columns}
        data={filtered}
        emptyResourceName="objects"
        filterColumn={filterColumnId}
        filterValue={deferredSearch}
        initialSorting={initialSorting}
        onFilterChange={onSearchChange}
        pageSize={pageSize}
        tableKey={tableKey}
      />
    </div>
  );
}

// Granted-object inventory used by the schema and PUBLIC drill-ins: Object ·
// Kind · Granted by · Privileges, on the shared kind tabs + search shell.
function GrantedObjectsTable({
  activeKind,
  objects,
  onKindChange,
  onSearchChange,
  search,
}: {
  activeKind: string;
  objects: GrantedObject[];
  onKindChange: (slug: string) => void;
  onSearchChange: (value: string) => void;
  search: string;
}) {
  const columns: DataTableColumnDef<GrantedObject>[] = [
    {
      accessorFn: (row) => objectDisplayName(row),
      cell: ({ row }) => <ObjectNameCell object={row.original} />,
      filterFn: "includesString",
      header: ({ column }) => (
        <SortableHeader column={column}>Object</SortableHeader>
      ),
      id: "object",
    },
    {
      accessorFn: (row) => OBJECT_TYPE_LABEL(row.objectType),
      cell: ({ row }) => (
        <span className="font-mono text-[10.5px] lowercase tracking-[0.04em]">
          {OBJECT_TYPE_LABEL(row.original.objectType).toLowerCase()}
        </span>
      ),
      header: ({ column }) => (
        <SortableHeader column={column}>Kind</SortableHeader>
      ),
      id: "kind",
      meta: { cellClassName: "whitespace-nowrap text-muted-foreground" },
    },
    {
      accessorFn: (row) => grantorSummary(row.grantors)?.text ?? "",
      cell: ({ row }) => <GrantorCell object={row.original} />,
      header: ({ column }) => (
        <SortableHeader column={column}>Granted by</SortableHeader>
      ),
      id: "grantor",
      meta: { cellClassName: "whitespace-nowrap" },
    },
    {
      cell: ({ row }) => (
        <HeldPillStrip
          columns={columnsFor(row.original.objectType, [row.original])}
          object={row.original}
        />
      ),
      enableSorting: false,
      header: "Privileges",
      id: "privileges",
      meta: { cellClassName: "text-right", headerClassName: "text-right" },
    },
  ];

  return (
    <KindFilteredTable
      activeKind={activeKind}
      columns={columns}
      data={objects}
      filterColumnId="object"
      initialSorting={[{ desc: false, id: "object" }]}
      kindOf={(object) => object.objectType}
      onKindChange={onKindChange}
      onSearchChange={onSearchChange}
      pageSize={GRANT_PAGE_SIZE}
      search={search}
      searchPlaceholder="Search objects…"
      tableKey="role-grants-objects"
      typeOrder={GRANT_TYPE_ORDER}
    />
  );
}

export { GrantedObjectsTable, KindFilteredTable };
