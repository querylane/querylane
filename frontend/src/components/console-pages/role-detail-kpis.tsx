"use client";

import type { RoleDetailViewProps } from "@/components/console-pages/role-detail-model";
import { KpiCard } from "@/components/console-pages/role-detail-shared";

// KPI strip for an ordinary (non-built-in) role.
function OrdinaryRoleKpis({
  attributes,
  belongsTo,
  connLimitSub,
  directGrantsSub,
  grantObjects,
  grantsReady,
  memberRows,
  ownedObjects,
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
        value={grantsReady ? grantObjects.length : "—"}
      />
      <KpiCard
        label="Owns"
        sub={ownedSub}
        value={ownedReady ? ownedObjects.length : "—"}
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
