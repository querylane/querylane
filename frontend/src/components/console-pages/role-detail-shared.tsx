"use client";
import { Link } from "@tanstack/react-router";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  TriangleAlert,
  UserRound,
  Users,
} from "lucide-react";
import { SectionCard } from "@/components/console-pages/console-layout";
import type {
  Capability,
  RelatedRole,
} from "@/components/console-pages/role-detail-model";
import { capabilities } from "@/components/console-pages/role-detail-model";
import { EmptyState } from "@/components/empty-state";
import { EmptyStatePanel } from "@/components/empty-state-panel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { cn } from "@/lib/utils";
import type { Role } from "@/protogen/querylane/console/v1alpha1/role_pb";

function KpiCard({
  label,
  sub,
  value,
}: {
  label: string;
  sub?: string | undefined;
  value: React.ReactNode;
}) {
  return (
    <Card className="border-border" size="sm">
      <CardContent className="flex flex-col gap-1 px-4 py-3">
        <div className="flex items-center gap-1.5 text-muted-foreground text-xs uppercase tracking-wide">
          {label}
        </div>
        <div className="font-semibold text-lg tabular-nums">{value}</div>
        {sub ? (
          <div className="text-muted-foreground text-xs">{sub}</div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function RolePartialAccessAlert({ databaseName }: { databaseName: string }) {
  return (
    <Alert role="status">
      <TriangleAlert aria-hidden="true" className="size-4" />
      <AlertTitle>{"Some access data is not shown"}</AlertTitle>
      <AlertDescription>
        {"One or more access categories for "}
        {databaseName}
        {
          " exceed the 1,000-result limit. Counts and relationships may be incomplete."
        }
      </AlertDescription>
    </Alert>
  );
}

function capabilityTileClass(cap: Capability): string {
  return cn(
    "flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors",
    cap.on && cap.danger && "border-amber-500/30 bg-amber-500/5",
    cap.on && !cap.danger && "border-border bg-muted/30",
    !cap.on && "border-border/50 border-dashed"
  );
}

function capabilityIconClass(cap: Capability): string {
  return cn(
    "flex size-8 shrink-0 items-center justify-center rounded-md",
    cap.on &&
      cap.danger &&
      "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    cap.on &&
      !cap.danger &&
      "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    !cap.on && "bg-muted text-muted-foreground/40"
  );
}

function capabilityKeywordClass(cap: Capability): string {
  return cn(
    "font-medium font-mono text-xs",
    cap.on && cap.danger && "text-amber-700 dark:text-amber-400",
    !cap.on && "text-muted-foreground"
  );
}

function capabilityValueClass(cap: Capability): string {
  if (!cap.on) {
    return "text-muted-foreground/60";
  }
  return cap.danger ? "text-amber-700 dark:text-amber-400" : "text-foreground";
}

// The trailing marker: a concrete value when one exists, else a check (on) or
// an "Off" label. Split out as early-returns so CapabilityTile stays simple.
function CapabilityMarker({ cap }: { cap: Capability }) {
  if (cap.value !== undefined) {
    return (
      <span
        className={cn("shrink-0 font-mono text-xs", capabilityValueClass(cap))}
      >
        {cap.value}
      </span>
    );
  }
  if (cap.on) {
    return (
      <Check
        className={cn(
          "size-4 shrink-0",
          cap.danger
            ? "text-amber-600 dark:text-amber-400"
            : "text-emerald-600 dark:text-emerald-400"
        )}
      />
    );
  }
  return (
    <span className="shrink-0 text-[10px] text-muted-foreground/50 uppercase tracking-wide">
      {"Off"}
    </span>
  );
}

function CapabilityTile({ cap }: { cap: Capability }) {
  const Icon = cap.icon;
  return (
    <div className={capabilityTileClass(cap)}>
      <span className={capabilityIconClass(cap)}>
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <span className={capabilityKeywordClass(cap)}>{cap.keyword}</span>
        <p
          className={cn(
            "text-xs leading-snug",
            cap.on ? "text-muted-foreground" : "text-muted-foreground/50"
          )}
        >
          {cap.description}
        </p>
      </div>
      <CapabilityMarker cap={cap} />
    </div>
  );
}

// Role attributes (pg_roles.rol* columns) — these belong to the role itself and
// are never inherited through membership. Shown for every role, including
// built-in pg_* roles (whose attributes are all off and fixed).
function RoleAttributesCard({ role }: { role: Role }) {
  const caps = capabilities(role.attributes);
  return (
    <SectionCard
      description="Role-level attributes from pg_roles (LOGIN, SUPERUSER, …). They apply to the role itself and are never inherited through group membership."
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

function AccessItem({
  instanceId,
  related,
}: {
  instanceId: string;
  related: RelatedRole;
}) {
  return (
    <Item
      className="hover:bg-muted/50"
      render={
        <Link
          params={{ instanceId, roleId: related.roleId }}
          to="/instances/$instanceId/roles/$roleId"
        />
      }
      size="sm"
      variant="outline"
    >
      <ItemMedia variant="icon">
        <Users className="text-muted-foreground" />
      </ItemMedia>
      <ItemContent>
        <ItemTitle className="break-all font-mono">
          {related.roleName}
        </ItemTitle>
        {related.options.length > 0 || related.grantor ? (
          <div className="flex flex-wrap items-center gap-1.5 text-muted-foreground text-xs">
            {related.options.map((option) => (
              <Badge key={option.key} variant="secondary">
                {option.label}
              </Badge>
            ))}
            {related.grantor ? (
              <span>
                {"by "}
                {related.grantor}
              </span>
            ) : null}
          </div>
        ) : null}
      </ItemContent>
      <ItemActions>
        <ChevronRight className="size-4 text-muted-foreground" />
      </ItemActions>
    </Item>
  );
}

function AccessCard({
  description,
  emptyHint,
  instanceId,
  roles,
  title,
}: {
  description: string;
  emptyHint: string;
  instanceId: string;
  roles: RelatedRole[];
  title: string;
}) {
  return (
    <SectionCard description={description} title={title}>
      {roles.length === 0 ? (
        <EmptyStatePanel
          className="min-h-24 rounded-md px-4 py-6"
          icon={UserRound}
        >
          {emptyHint}
        </EmptyStatePanel>
      ) : (
        <ItemGroup>
          {roles.map((related) => (
            <AccessItem
              instanceId={instanceId}
              key={related.roleId}
              related={related}
            />
          ))}
        </ItemGroup>
      )}
    </SectionCard>
  );
}

function RoleNotFound({ instanceId }: { instanceId: string }) {
  return (
    <div className="flex flex-col gap-6">
      <Link
        className="inline-flex w-fit flex-row items-center gap-1 text-muted-foreground text-sm leading-none hover:text-foreground"
        params={{ instanceId }}
        search={{}}
        to="/instances/$instanceId/roles"
      >
        <ChevronLeft className="size-4 shrink-0" />
        <span>{"All roles"}</span>
      </Link>
      <EmptyState
        description="This role is no longer available on the instance."
        icon={Users}
        title="Role not found"
      />
    </div>
  );
}

// One row of the access-sources summary — a single way the role can gain access.
// `scope` groups the row: cluster-wide sources apply everywhere; database

export {
  AccessCard,
  AccessItem,
  CapabilityTile,
  KpiCard,
  RoleAttributesCard,
  RoleNotFound,
  RolePartialAccessAlert,
};
