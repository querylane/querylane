import type { ComponentProps } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function StatusBadge({
  className,
  variant,
  ...props
}: Omit<ComponentProps<typeof Badge>, "variant"> & {
  variant: "success" | "warning";
}) {
  return (
    <Badge
      className={cn(
        variant === "success" &&
          "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 [a]:hover:bg-emerald-500/20",
        variant === "warning" &&
          "border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300 [a]:hover:bg-amber-500/20",
        className
      )}
      variant={variant === "success" ? "secondary" : "outline"}
      {...props}
    />
  );
}

export { StatusBadge };
