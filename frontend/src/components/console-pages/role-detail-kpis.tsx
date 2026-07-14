"use client";

import type { RoleDetailViewProps } from "@/components/console-pages/role-detail-model";
import { KpiCard } from "@/components/console-pages/role-detail-shared";

function PartialKpiValue({
  partial,
  value,
}: {
  partial: boolean;
  value: number | string;
}) {
  return (
    <span className="flex items-baseline gap-2">
      {value}
      {partial ? (
        <span className="font-normal text-muted-foreground text-xs">
          {"Partial"}
        </span>
      ) : null}
    </span>
  );
}

// KPI strip for an ordinary (non-built-in) role.
function OrdinaryRoleKpis({
  attributes,
  belongsTo,
  connLimitSub,
  directGrantsSub,
  grantObjects,
  grantsPartial,
  grantsReady,
  memberRows,
  ownedObjects,
  ownedPartial,
  ownedReady,
  ownedSub,
}: RoleDetailViewProps) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <KpiCard
        label="Can log in"
        sub={connLimitSub}
        value={attributes?.canLogin ? "Yes" : "No"}
      />
      <KpiCard
        label="Direct grants"
        sub={directGrantsSub}
        value={
          <PartialKpiValue
            partial={grantsPartial}
            value={grantsReady ? grantObjects.length : "—"}
          />
        }
      />
      <KpiCard
        label="Owns"
        sub={ownedSub}
        value={
          <PartialKpiValue
            partial={ownedPartial}
            value={ownedReady ? ownedObjects.length : "—"}
          />
        }
      />
      <KpiCard
        label="Members"
        sub={
          belongsTo.length > 0 ? `inherits ${belongsTo.length}` : "no parents"
        }
        value={memberRows.length}
      />
    </div>
  );
}

export { OrdinaryRoleKpis };
