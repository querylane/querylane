"use client";

import { Crown, Info, Plus } from "lucide-react";
import { useState } from "react";
import {
  GrantObjectKindBadge,
  KindFilteredTable,
} from "@/components/console-pages/role-grants-object-table";
import {
  ContentHead,
  CountPill,
  GrantsEmptyState,
} from "@/components/console-pages/role-grants-pills";
import {
  GRANT_OBJECT_META,
  type GrantedObject,
  getObjectTypeLabel,
  OWNED_TYPE_ORDER,
  ownedObjectName,
  PRIV_TONE_CLASS,
  type PrivTone,
} from "@/components/console-pages/role-grants-shared";
import { Button } from "@/components/ui/button";
import {
  type DataTableColumnDef,
  SortableHeader,
} from "@/components/ui/data-table";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { SqlCodeBlock } from "@/components/ui/sql-code-block";
import { anyPredicate } from "@/lib/predicates";
import type { RoleKind } from "@/lib/role-display";
import { cn } from "@/lib/utils";
import {
  GrantObjectType,
  type OwnedObject,
} from "@/protogen/querylane/console/v1alpha1/role_pb";

// ───────── "What ownership grants" legend ─────────

const OWNERSHIP_PRIVS: { key: string; tone: PrivTone }[] = [
  { key: "DROP", tone: "destructive" },
  { key: "ALTER", tone: "destructive" },
  { key: "TRUNCATE", tone: "destructive" },
  { key: "SELECT", tone: "read" },
  { key: "INSERT", tone: "write" },
  { key: "UPDATE", tone: "write" },
  { key: "DELETE", tone: "destructive" },
  { key: "GRANT", tone: "create" },
  { key: "REVOKE", tone: "create" },
];

function OwnershipPill({ name, tone }: { name: string; tone: PrivTone }) {
  return (
    <span
      className={cn(
        "inline-flex h-[21px] items-center rounded border px-2 font-medium font-mono text-[10px] tracking-[0.06em]",
        PRIV_TONE_CLASS[tone]
      )}
    >
      {name}
    </span>
  );
}

function ImplicitTag() {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            className="h-[22px] gap-1 rounded-full border-amber-500/30 px-2 font-normal text-[10.5px] text-amber-600 lowercase hover:bg-amber-500/10 dark:text-amber-400"
            size="xs"
            type="button"
            variant="outline"
          />
        }
      >
        {"implicit"}
        <Info className="size-2.5 opacity-70" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-96 gap-2.5">
        <div className="flex items-center gap-2">
          <Crown className="size-3.5 text-amber-500 dark:text-amber-400" />
          <span className="font-semibold text-[12.5px] text-foreground">
            {"What ownership grants"}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {OWNERSHIP_PRIVS.map((privilege) => (
            <OwnershipPill
              key={privilege.key}
              name={privilege.key}
              tone={privilege.tone}
            />
          ))}
        </div>
        <div className="flex items-start gap-1.5 text-[11.5px] text-muted-foreground leading-relaxed">
          <Info className="mt-0.5 size-3 shrink-0" />
          <span>
            {"Enforced by"}{" "}
            <span className="font-mono text-foreground/80">{"relowner"}</span>
            {" /"}{" "}
            <span className="font-mono text-foreground/80">{"nspowner"}</span>
            {", not stored in"}{" "}
            <span className="font-mono text-foreground/80">
              {"pg_class.relacl"}
            </span>
            {
              ". An owner can give privileges away, take them back, and destroy the object, even with no ACL row."
            }
          </span>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ───────── Future-owned note (real CREATE-on-schema data) ─────────

function FutureOwnedNote({
  roleName,
  schemas,
}: {
  roleName: string;
  schemas: string[];
}) {
  return (
    <div className="flex items-start gap-2 rounded-sm border border-violet-500/20 border-l border-l-violet-500/55 bg-violet-500/[0.04] px-3 py-2 text-muted-foreground text-xs leading-relaxed">
      <Plus className="mt-0.5 size-3 shrink-0 text-violet-600 dark:text-violet-300" />
      <span>
        {"Future-owned:"}{" "}
        <span className="font-mono text-foreground/80">{roleName}</span>
        {" can"}{" "}
        <span className="font-mono text-foreground/80">{"CREATE"}</span>
        {" in"}{" "}
        {schemas.map((schema, index) => (
          <span key={schema}>
            <span className="font-mono text-foreground/80">{schema}</span>
            {index < schemas.length - 1 ? ", " : ""}
          </span>
        ))}
        {": anything created there is owned by it."}
      </span>
    </div>
  );
}

// ───────── Owned-object inventory ─────────

function OwnedObjectCell({ object }: { object: OwnedObject }) {
  const meta =
    GRANT_OBJECT_META[object.objectType] ??
    GRANT_OBJECT_META[GrantObjectType.UNSPECIFIED];
  const showSchema =
    Boolean(object.schemaName) &&
    object.objectType !== GrantObjectType.SCHEMA &&
    object.objectType !== GrantObjectType.DATABASE;
  return (
    <span className="flex items-center gap-2">
      <meta.icon className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="font-mono text-[12.5px]">
        {showSchema ? (
          <span className="text-muted-foreground">
            {object.schemaName}
            {"."}
          </span>
        ) : null}
        <span className="text-foreground">{ownedObjectName(object)}</span>
      </span>
    </span>
  );
}

function OwnedObjectsTable({
  objects,
  partial,
}: {
  objects: OwnedObject[];
  partial: boolean;
}) {
  const [activeKind, setActiveKind] = useState("all");
  const [search, setSearch] = useState("");

  const columns: DataTableColumnDef<OwnedObject>[] = [
    {
      accessorFn: (object) => ownedObjectName(object),
      cell: ({ row }) => <OwnedObjectCell object={row.original} />,
      filterFn: "includesString",
      header: ({ column }) => (
        <SortableHeader column={column}>{"Object"}</SortableHeader>
      ),
      id: "object",
    },
    {
      accessorFn: (object) => getObjectTypeLabel(object.objectType),
      cell: ({ row }) => (
        <GrantObjectKindBadge type={row.original.objectType} />
      ),
      header: ({ column }) => (
        <SortableHeader column={column}>{"Kind"}</SortableHeader>
      ),
      id: "kind",
      meta: { cellClassName: "whitespace-nowrap" },
    },
  ];

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2.5 px-0.5">
        <span className="font-semibold text-foreground text-sm">
          {"Owned objects"}
        </span>
        <CountPill partial={partial} value={objects.length} />
      </div>
      <KindFilteredTable
        activeKind={activeKind}
        columns={columns}
        data={objects}
        filterColumnId="object"
        initialSorting={[{ desc: false, id: "object" }]}
        kindOf={(object) => object.objectType}
        onKindChange={setActiveKind}
        onSearchChange={setSearch}
        search={search}
        searchPlaceholder="Search owned objects…"
        tableKey="role-owned-objects"
        typeOrder={OWNED_TYPE_ORDER}
      />
    </section>
  );
}

// ───────── Cleanup card ─────────

function CleanupCard({
  count,
  partial,
  roleName,
}: {
  count: number;
  partial: boolean;
  roleName: string;
}) {
  // Quote the identifier so the copy-paste SQL is valid for role names needing
  // quoting (uppercase, spaces, special chars). Display-only, never executed.
  const quoted = `"${roleName.replaceAll('"', '""')}"`;
  const sql = `-- Required before DROP ROLE ${quoted};
REASSIGN OWNED BY ${quoted} TO postgres;
DROP OWNED BY ${quoted};`;
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2.5 px-0.5">
        <span className="font-semibold text-foreground text-sm">
          {"Before dropping this role"}
        </span>
        <span className="ml-auto text-[11.5px] text-muted-foreground">
          {partial
            ? "Available owned objects would block "
            : `${count.toLocaleString()} object${count === 1 ? "" : "s"} would block `}
          <span className="font-mono">{"DROP ROLE"}</span>
        </span>
      </div>
      <div className="flex flex-col gap-3 rounded-md border border-red-500/25 bg-red-500/[0.04] p-3.5">
        <p className="text-[12.5px] text-foreground/80 leading-relaxed">
          {"Postgres refuses "}
          <span className="font-mono">
            {"DROP ROLE "}
            {quoted}
          </span>{" "}
          {
            "while it owns anything. Reassign ownership to another role, then drop the leftovers."
          }
        </p>
        <SqlCodeBlock sql={sql} />
        <p className="text-[11.5px] text-muted-foreground">
          {"Or transfer ownership object-by-object:"}{" "}
          <span className="font-mono text-foreground/75">
            {"ALTER … OWNER TO <new_owner>;"}
          </span>
        </p>
      </div>
    </section>
  );
}

// ───────── Owns view ─────────

function OwnsDescription({
  databaseName,
  isEmpty,
  isSuper,
  partial,
  roleName,
}: {
  databaseName: string | undefined;
  isEmpty: boolean;
  isSuper: boolean;
  partial: boolean;
  roleName: string;
}) {
  if (isSuper) {
    return "Superuser bypasses ownership checks anyway; the list below is informational.";
  }
  if (isEmpty && partial) {
    return "No owned objects are shown in the available results.";
  }
  if (isEmpty) {
    return (
      <>
        <span className="font-mono text-foreground/80">{roleName}</span>{" "}
        {"doesn't own any objects in"}{" "}
        <span className="font-mono text-foreground/80">{databaseName}</span>{" "}
        {
          "today. Ownership still matters: anything this role creates becomes owned by it."
        }
      </>
    );
  }
  return (
    <>
      <span className="font-mono text-foreground/80">{roleName}</span>
      {
        " created or was assigned ownership of these objects. As owner, it implicitly holds every privilege on each, none of which appears in the direct grants."
      }
    </>
  );
}

function schemasWithCreateGrant(directGrants: GrantedObject[]): string[] {
  return directGrants.flatMap((object) => {
    const canCreate = object.privileges.some(
      (privilege) => privilege.name === "CREATE"
    );
    return object.objectType === GrantObjectType.SCHEMA && canCreate
      ? [object.schemaName || object.objectName]
      : [];
  });
}

function OwnedObjectsContent({
  databaseName,
  isEmpty,
  ownedObjects,
  partial,
}: {
  databaseName: string | undefined;
  isEmpty: boolean;
  ownedObjects: OwnedObject[];
  partial: boolean;
}) {
  if (!isEmpty) {
    return <OwnedObjectsTable objects={ownedObjects} partial={partial} />;
  }
  return (
    <GrantsEmptyState
      title={partial ? "Owned object results are incomplete" : undefined}
    >
      {partial ? (
        "No owned objects are shown in the available results."
      ) : (
        <>
          {"No owned objects in"}{" "}
          <span className="font-mono text-foreground/80">{databaseName}</span>
          {"."}
        </>
      )}
    </GrantsEmptyState>
  );
}

export function OwnsGrantsView({
  databaseName,
  directGrants,
  kind,
  ownedObjects,
  partial,
  roleName,
}: {
  databaseName: string | undefined;
  directGrants: GrantedObject[];
  kind: RoleKind;
  ownedObjects: OwnedObject[];
  partial: boolean;
  roleName: string;
}) {
  const isSuper = kind === "super";
  const isEmpty = ownedObjects.length === 0;
  const createInSchemas = schemasWithCreateGrant(directGrants);

  return (
    <div className="flex flex-col">
      <ContentHead
        count={isEmpty ? undefined : ownedObjects.length}
        countUnit="object"
        icon={Crown}
        iconClassName="text-amber-500 dark:text-amber-400"
        partial={partial}
        title="Owns"
      >
        <ImplicitTag />
      </ContentHead>
      <p className="-mt-1 max-w-[680px] pb-5 text-muted-foreground text-sm leading-relaxed">
        <OwnsDescription
          databaseName={databaseName}
          isEmpty={isEmpty}
          isSuper={isSuper}
          partial={partial}
          roleName={roleName}
        />
      </p>

      <div className="flex flex-col gap-7">
        {createInSchemas.length > 0 ? (
          <FutureOwnedNote roleName={roleName} schemas={createInSchemas} />
        ) : null}

        <OwnedObjectsContent
          databaseName={databaseName}
          isEmpty={isEmpty}
          ownedObjects={ownedObjects}
          partial={partial}
        />

        {anyPredicate(
          () => isEmpty,
          () => isSuper
        ) ? null : (
          <CleanupCard
            count={ownedObjects.length}
            partial={partial}
            roleName={roleName}
          />
        )}
      </div>
    </div>
  );
}
