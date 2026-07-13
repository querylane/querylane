import { cva } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

const statusBadgeVariants = cva(
  "inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-4xl border px-2 py-0.5 font-medium text-xs",
  {
    variants: {
      variant: {
        success:
          "border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
        warning:
          "border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300",
      },
    },
  }
);

function StatusBadge({
  className,
  variant,
  ...props
}: ComponentProps<"span"> & {
  variant: "success" | "warning";
}) {
  return (
    <span
      className={cn(statusBadgeVariants({ variant }), className)}
      data-slot="status-badge"
      {...props}
    />
  );
}

export { StatusBadge };
