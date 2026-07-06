"use client";

import { Link } from "@tanstack/react-router";
import {
  ChevronRight,
  Database,
  Globe,
  Info,
  Lock,
  Network,
  ShieldCheck,
  Users,
  Zap,
} from "lucide-react";
import { SectionCard } from "@/components/console-pages/console-layout";
import {
  capabilities,
  type RelatedRole,
} from "@/components/console-pages/role-detail-model";
import {
  AccessItem,
  CapabilityTile,
  KpiCard,
} from "@/components/console-pages/role-detail-shared";
import { GrantGroups } from "@/components/console-pages/role-grants-groups";
import type { GrantedObject } from "@/components/console-pages/role-grants-shared";
import { DatabaseSelect } from "@/components/console-pages/role-grants-tab";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ItemGroup } from "@/components/ui/item";
import { SqlCodeBlock } from "@/components/ui/sql-code-block";
import type { PredefinedRoleInfo } from "@/lib/role-display";
import type { Role } from "@/protogen/querylane/console/v1alpha1/role_pb";

interface BuiltinParent {
  roleId: string;
  roleName: string;
  summary: string | null;
}

function BuiltinPowersCard({
  builtinInfo,
  instanceId,
  parents,
}: {
  builtinInfo: PredefinedRoleInfo | null;
  instanceId: string;
  parents: BuiltinParent[];
}) {
  const capabilities = builtinInfo?.implicit ?? [];
  return (
    <Card className="gap-0 border-border py-0">
      <div className="flex items-start gap-3.5 px-6 pt-6 pb-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-emerald-500/25 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
          <ShieldCheck className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-[15px] tracking-tight">
            What members can do
          </h3>
          <p className="mt-1 text-[13px] text-muted-foreground leading-relaxed">
            Powers this role grants automatically: the same everywhere in the
            cluster.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2.5 px-6 pb-3">
        <span className="flex items-center gap-1.5 font-medium text-[11px] text-muted-foreground/70 uppercase tracking-wider">
          <Globe className="size-3 text-muted-foreground" />
          Cluster-wide
        </span>
        <span className="h-px flex-1 bg-gradient-to-r from-border to-transparent" />
        {capabilities.length > 0 ? (
          <span className="text-[11px] text-muted-foreground/70 tabular-nums">
            {capabilities.length}{" "}
            {capabilities.length === 1 ? "capability" : "capabilities"}
          </span>
        ) : null}
      </div>

      {capabilities.length > 0 ? (
        <div className="flex flex-col gap-2 px-6">
          {capabilities.map((line) => (
            <div
              className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 px-3.5 py-3"
              key={line}
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground">
                <Zap className="size-4" />
              </span>
              <span className="min-w-0 flex-1 font-medium text-sm">{line}</span>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 font-medium text-[11px] text-amber-700 dark:text-amber-400">
                <Lock className="size-3" />
                Can&apos;t revoke
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="px-6 text-muted-foreground text-sm">
          Grants implicit privileges to its members. This role isn&apos;t in our
          catalogue, so the exact set isn&apos;t listed here; check the
          PostgreSQL documentation for your server version.
        </p>
      )}

      {parents.length > 0 ? (
        <div className="mt-3 flex flex-col gap-2 px-6">
          <span className="flex items-center gap-1.5 font-medium text-[11px] text-muted-foreground/70 uppercase tracking-wider">
            <Network className="size-3 text-muted-foreground" />
            Also inherits via membership
          </span>
          {parents.map((parent) => (
            <Link
              className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 px-3.5 py-3 transition-colors hover:bg-muted/50"
              key={parent.roleId}
              params={{ instanceId, roleId: parent.roleId }}
              to="/instances/$instanceId/roles/$roleId"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground">
                <ShieldCheck className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium font-mono text-sm">
                  {parent.roleName}
                </span>
                {parent.summary ? (
                  <span className="block truncate text-muted-foreground text-xs">
                    {parent.summary}
                  </span>
                ) : null}
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          ))}
          <p className="text-muted-foreground text-xs">
            Real <span className="font-mono">pg_auth_members</span> grants:
            members of this role transitively receive their powers too.
          </p>
        </div>
      ) : null}

      <div className="px-6 pt-4 pb-6">
        <div className="flex gap-3 rounded-xl border border-border bg-muted/20 p-3.5">
          <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground/60" />
          <div className="min-w-0">
            <p className="text-muted-foreground text-xs leading-relaxed">
              <span className="font-medium text-foreground">
                Built-in privilege.
              </span>{" "}
              Enforced by PostgreSQL&apos;s{" "}
              <span className="rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground">
                has_*_privilege()
              </span>{" "}
              checks, not{" "}
              <span className="rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground">
                GRANT
              </span>{" "}
              rows, so there&apos;s nothing to inspect or revoke. Membership is
              the only switch.
            </p>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              {builtinInfo ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground">
                  <span className="size-1.5 rounded-full bg-violet-500" />
                  {builtinInfo.since}+
                </span>
              ) : null}
              <span className="rounded-full border border-border bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground">
                Exact set varies by server version
              </span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

function BuiltinMembersCard({
  instanceId,
  members,
  roleName,
}: {
  instanceId: string;
  members: RelatedRole[];
  roleName: string;
}) {
  const isDatabaseOwner = roleName === "pg_database_owner";
  let body: React.ReactNode;
  if (isDatabaseOwner) {
    body = (
      <p className="text-muted-foreground text-sm">
        Membership is implicit: whoever owns the current database is treated as
        a member, with no row in{" "}
        <span className="font-mono">pg_auth_members</span>. There is nothing to
        list here.
      </p>
    );
  } else if (members.length === 0) {
    body = (
      <EmptyState
        description={`No roles are members of ${roleName}. Nobody currently holds this power.`}
        icon={Users}
        title="No members"
      />
    );
  } else {
    body = (
      <ItemGroup>
        {members.map((member) => (
          <AccessItem
            instanceId={instanceId}
            key={member.roleId}
            related={member}
          />
        ))}
      </ItemGroup>
    );
  }
  return (
    <SectionCard
      action={
        !isDatabaseOwner && members.length > 0 ? (
          <Badge variant="secondary">{members.length}</Badge>
        ) : undefined
      }
      description="Roles that are members of this role, and therefore hold its powers."
      title="Members — who has this power"
    >
      {body}
    </SectionCard>
  );
}

function BuiltinExtraGrantsCard({
  databaseName,
  databases,
  error,
  isPending,
  objects,
  onSelectDatabase,
  roleName,
  selectedDatabaseId,
}: {
  databaseName: string | undefined;
  databases: { id: string; name: string }[];
  error: unknown;
  isPending: boolean;
  objects: GrantedObject[];
  onSelectDatabase: (value: string) => void;
  roleName: string;
  selectedDatabaseId: string | undefined;
}) {
  let body: React.ReactNode;
  if (databases.length === 0) {
    body = (
      <EmptyState
        description="This instance has no databases to inspect for object privileges."
        icon={Database}
        title="No databases"
      />
    );
  } else if (isPending) {
    body = <p className="text-muted-foreground text-sm">Loading grants…</p>;
  } else if (error) {
    body = (
      <p className="text-destructive text-sm">
        Could not load grants for{" "}
        <span className="font-mono">{databaseName}</span>.
      </p>
    );
  } else if (objects.length === 0) {
    body = (
      <p className="text-muted-foreground text-sm">
        Nothing has been granted directly to{" "}
        <span className="font-mono">{roleName}</span> in{" "}
        <span className="font-mono">{databaseName}</span>. Its access here comes
        entirely from the built-in powers above.
      </p>
    );
  } else {
    body = <GrantGroups objects={objects} />;
  }
  return (
    <SectionCard
      action={
        databases.length > 0 ? (
          <DatabaseSelect
            databases={databases}
            onChange={onSelectDatabase}
            value={selectedDatabaseId}
          />
        ) : undefined
      }
      description="Object privileges an admin GRANTed straight to this role. Unlike the built-in powers, these are real ACL entries — recorded in the catalog and revocable."
      title="Granted to it directly"
    >
      {body}
    </SectionCard>
  );
}

function BuiltinAttributesCard({ role }: { role: Role }) {
  const caps = capabilities(role.attributes);
  return (
    <SectionCard
      description="Role-level attributes from pg_roles. For a built-in role these are fixed — it can't log in and holds no special powers of its own."
      title="Role attributes"
    >
      <div className="grid gap-2 sm:grid-cols-2">
        {caps.map((cap) => (
          <CapabilityTile cap={cap} key={cap.keyword} />
        ))}
      </div>
    </SectionCard>
  );
}

// Built-in roles render as a single scroll (no tabs), so their GRANT/REVOKE
// definition lives in an inline card rather than the Definition tab that ordinary
// roles get.
function BuiltinManageCard({ role }: { role: Role }) {
  const sql = `GRANT ${role.roleName} TO your_role;\nREVOKE ${role.roleName} FROM your_role;`;
  return (
    <SectionCard
      description="Built-in roles ship with PostgreSQL — you can't create or drop them. Confer or remove the power by granting membership; replace your_role with the target role."
      title="Manage this role"
    >
      <SqlCodeBlock sql={sql} />
    </SectionCard>
  );
}

function BuiltinRoleBody({
  builtinInfo,
  databaseName,
  databases,
  grantObjects,
  grantsError,
  grantsPending,
  instanceId,
  members,
  onSelectDatabase,
  parents,
  role,
  selectedDatabaseId,
}: {
  builtinInfo: PredefinedRoleInfo | null;
  databaseName: string | undefined;
  databases: { id: string; name: string }[];
  grantObjects: GrantedObject[];
  grantsError: unknown;
  grantsPending: boolean;
  instanceId: string;
  members: RelatedRole[];
  onSelectDatabase: (value: string) => void;
  parents: BuiltinParent[];
  role: Role;
  selectedDatabaseId: string | undefined;
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <KpiCard
          label="Members"
          sub={members.length === 1 ? "role holds this" : "roles hold this"}
          value={members.length}
        />
        <KpiCard
          label="Inherits"
          sub={parents.length > 0 ? "built-in roles" : "standalone"}
          value={parents.length}
        />
        <KpiCard
          label="Introduced"
          sub="PostgreSQL version"
          value={builtinInfo?.since ?? "Built-in"}
        />
      </div>
      <BuiltinPowersCard
        builtinInfo={builtinInfo}
        instanceId={instanceId}
        parents={parents}
      />
      <BuiltinMembersCard
        instanceId={instanceId}
        members={members}
        roleName={role.roleName}
      />
      <BuiltinExtraGrantsCard
        databaseName={databaseName}
        databases={databases}
        error={grantsError}
        isPending={grantsPending}
        objects={grantObjects}
        onSelectDatabase={onSelectDatabase}
        roleName={role.roleName}
        selectedDatabaseId={selectedDatabaseId}
      />
      <BuiltinAttributesCard role={role} />
      <BuiltinManageCard role={role} />
    </>
  );
}

// KPI sub-label for the Direct-grants tile: a load/empty state, or the schema

export { BuiltinRoleBody };
