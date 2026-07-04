"use client";

import type { RoleDetailViewProps } from "@/components/console-pages/role-detail-model";
import { AccessCard } from "@/components/console-pages/role-detail-shared";

function RoleMembershipTab({
  belongsTo,
  instanceId,
  memberRows,
}: RoleDetailViewProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <AccessCard
        description="Inherits the access of these roles."
        emptyHint="This role is not a member of any other role."
        instanceId={instanceId}
        roles={belongsTo}
        title="Inherits from"
      />
      <AccessCard
        description="These roles inherit its access."
        emptyHint="No roles are members of this role."
        instanceId={instanceId}
        roles={memberRows}
        title="Granted to"
      />
    </div>
  );
}

export { RoleMembershipTab };
