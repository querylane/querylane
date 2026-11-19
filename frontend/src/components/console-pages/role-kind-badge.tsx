import { Badge } from "@/components/querylane-ui/badge";
import {
  deriveRoleKind,
  ROLE_KIND_LABEL,
  ROLE_KIND_TOOLTIP,
} from "@/lib/role-display";
import type { Role } from "@/protogen/querylane/console/v1alpha1/role_pb";

export function RoleKindBadge({ role }: { role: Role }) {
  const kind = deriveRoleKind(role);
  return (
    <Badge roleKind={kind} title={ROLE_KIND_TOOLTIP[kind]} variant="secondary">
      {ROLE_KIND_LABEL[kind]}
    </Badge>
  );
}
