import type { VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import {
  Avatar as BaseAvatar,
  AvatarFallback as BaseAvatarFallback,
} from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { roleTone } from "./role-tone";

function Avatar(props: ComponentProps<typeof BaseAvatar>) {
  return <BaseAvatar {...props} />;
}
function AvatarFallback({
  className,
  roleKind,
  ...props
}: ComponentProps<typeof BaseAvatarFallback> & VariantProps<typeof roleTone>) {
  return (
    <BaseAvatarFallback
      className={cn(roleTone({ roleKind }), className)}
      {...props}
    />
  );
}

export { Avatar, AvatarFallback };
