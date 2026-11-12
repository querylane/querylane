import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { RefreshControl as BaseRefreshControl } from "@/components/ui/refresh-control";
import { cn } from "@/lib/utils";

const refreshControlPresentations = cva("", {
  variants: {
    presentation: {
      compact: "text-xs text-muted-foreground",
    },
  },
});

function RefreshControl({
  className,
  presentation,
  ...props
}: ComponentProps<typeof BaseRefreshControl> &
  VariantProps<typeof refreshControlPresentations>) {
  return (
    <BaseRefreshControl
      className={cn(refreshControlPresentations({ presentation }), className)}
      {...props}
    />
  );
}

export { RefreshControl };
