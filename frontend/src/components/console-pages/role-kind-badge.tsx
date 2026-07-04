import { Badge } from "@/components/ui/badge";
import {
  deriveRoleKind,
  ROLE_KIND_LABEL,
  ROLE_KIND_TONE,
  ROLE_KIND_TOOLTIP,
} from "@/lib/role-display";
import type { Role } from "@/protogen/querylane/console/v1alpha1/role_pb";

// Single source for the role-kind badge. Reused by the roles table and the
// header breadcrumb so the classification, label, tone, and tooltip can't drift
// between the two places a role's category is shown.
export function RoleKindBadge({ role }: { role: Role }) {
  const kind = deriveRoleKind(role);
  return (
    <Badge
      className={ROLE_KIND_TONE[kind]}
      title={ROLE_KIND_TOOLTIP[kind]}
      variant="secondary"
    >
      {ROLE_KIND_LABEL[kind]}
    </Badge>
  );
}
