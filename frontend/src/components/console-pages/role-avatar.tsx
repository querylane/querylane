import { Copy, ShieldAlert, ShieldCheck, User, Users } from "lucide-react";
import type { ComponentType } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ROLE_KIND_TONE, type RoleKind } from "@/lib/role-display";

const KIND_ICON: Record<RoleKind, ComponentType<{ className?: string }>> = {
  builtin: ShieldCheck,
  group: Users,
  login: User,
  repl: Copy,
  super: ShieldAlert,
};

const ICON_SIZE: Record<"sm" | "default" | "lg", string> = {
  default: "size-4",
  lg: "size-5",
  sm: "size-3",
};

export function RoleAvatar({
  kind,
  size = "default",
}: {
  kind: RoleKind;
  size?: "sm" | "default" | "lg";
}) {
  const Icon = KIND_ICON[kind];
  return (
    <Avatar size={size}>
      <AvatarFallback className={ROLE_KIND_TONE[kind]}>
        <Icon className={ICON_SIZE[size]} />
      </AvatarFallback>
    </Avatar>
  );
}
