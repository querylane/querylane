import type { ComponentProps } from "react";
import { InlineCode as BaseInlineCode } from "@/components/ui/inline-code";
import { cn } from "@/lib/utils";

export function InlineCode({
  className,
  ...props
}: ComponentProps<typeof BaseInlineCode>) {
  return (
    <BaseInlineCode
      className={cn("text-foreground [overflow-wrap:anywhere]", className)}
      {...props}
    />
  );
}
