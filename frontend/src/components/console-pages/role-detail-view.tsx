"use client";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, Crown, ShieldCheck } from "lucide-react";
import { RoleAvatar } from "@/components/console-pages/role-avatar";
import { BuiltinRoleBody } from "@/components/console-pages/role-detail-builtins";
import { OrdinaryRoleKpis } from "@/components/console-pages/role-detail-kpis";
import type { RoleDetailViewProps } from "@/components/console-pages/role-detail-model";
import { OrdinaryRoleTabs } from "@/components/console-pages/role-detail-tabs";
import { Badge } from "@/components/ui/badge";
import {
  type deriveRoleKind,
  expiryToneClass,
  type PredefinedRoleInfo,
  type passwordExpiryStatus,
  ROLE_KIND_LABEL,
  ROLE_KIND_TOOLTIP,
} from "@/lib/role-display";
import type { RoleAttributes } from "@/protogen/querylane/console/v1alpha1/role_pb";

function RoleHero({
  attributes,
  builtinInfo,
  comment,
  expiry,
  isSystem,
  kind,
  ownedCount,
  roleName,
}: {
  attributes: RoleAttributes | undefined;
  builtinInfo: PredefinedRoleInfo | null;
  comment: string;
  expiry: ReturnType<typeof passwordExpiryStatus>;
  isSystem: boolean;
  kind: ReturnType<typeof deriveRoleKind>;
  ownedCount: number;
  roleName: string;
}) {
  const systemDescription =
    builtinInfo?.summary ?? "Built-in PostgreSQL role — ships in the cluster.";

  return (
    <div className="flex items-start gap-4">
      <RoleAvatar kind={kind} size="lg" />
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-mono font-semibold text-2xl tracking-tight">
            {roleName}
          </h1>
          <Badge title={ROLE_KIND_TOOLTIP[kind]} variant="secondary">
            {ROLE_KIND_LABEL[kind]}
          </Badge>
          {isSystem && builtinInfo ? (
            <Badge
              title={`Available since ${builtinInfo.since}`}
              variant="outline"
            >
              {builtinInfo.since}+
            </Badge>
          ) : null}
          {ownedCount > 0 ? (
            <Badge
              className="gap-1 border-amber-500/30 text-amber-700 dark:text-amber-400"
              title={`Owns ${ownedCount} object${ownedCount === 1 ? "" : "s"} — implicit full privileges on each`}
              variant="outline"
            >
              <Crown className="size-3" />
              OWNER · {ownedCount}
            </Badge>
          ) : null}
          {attributes?.validUntil ? (
            <Badge className={expiryToneClass(expiry.state)} variant="outline">
              {expiry.label}
            </Badge>
          ) : null}
        </div>
        {isSystem ? (
          <div className="flex items-center gap-1.5 text-muted-foreground text-sm">
            <ShieldCheck className="size-3.5 shrink-0" />
            <span>{systemDescription}</span>
          </div>
        ) : null}
        {!isSystem && comment ? (
          <div className="flex items-center gap-1.5 text-muted-foreground text-sm">
            <span>{comment}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// The full role-detail render. RoleDetailContent computes the view model and
// hands it here, keeping the data wiring and the markup in separate units.
function RoleDetailView(props: RoleDetailViewProps) {
  const {
    builtinInfo,
    builtinParentDetails,
    databases,
    effectiveDb,
    effectiveDbId,
    grantObjects,
    grantsError,
    grantsPending,
    instanceId,
    isSystem,
    memberRows,
    role,
    setChosenDbId,
  } = props;
  return (
    <div className="flex flex-col gap-6">
      <Link
        className="inline-flex w-fit flex-row items-center gap-1 text-muted-foreground text-sm leading-none hover:text-foreground"
        params={{ instanceId }}
        search={{}}
        to="/instances/$instanceId/roles"
      >
        <ChevronLeft className="size-4 shrink-0" />
        <span>All roles</span>
      </Link>

      <RoleHero
        attributes={props.attributes}
        builtinInfo={builtinInfo}
        comment={props.comment}
        expiry={props.expiry}
        isSystem={isSystem}
        kind={props.kind}
        ownedCount={props.ownedObjects.length}
        roleName={role.roleName}
      />

      {isSystem ? (
        <BuiltinRoleBody
          builtinInfo={builtinInfo}
          databaseName={effectiveDb?.name}
          databases={databases}
          grantObjects={grantObjects}
          grantsError={grantsError}
          grantsPending={grantsPending}
          instanceId={instanceId}
          members={memberRows}
          onSelectDatabase={setChosenDbId}
          parents={builtinParentDetails}
          role={role}
          selectedDatabaseId={effectiveDbId ?? undefined}
        />
      ) : (
        <>
          <OrdinaryRoleKpis {...props} />
          <OrdinaryRoleTabs {...props} />
        </>
      )}
    </div>
  );
}

export { RoleDetailView };
