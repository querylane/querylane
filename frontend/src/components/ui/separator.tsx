import { Separator as SeparatorPrimitive } from "@ui-sdk/react/separator";
import { cn } from "cn";
import type * as React from "react";

function Separator({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof SeparatorPrimitive>) {
  return (
    <SeparatorPrimitive
      className={cn(
        "shrink-0 bg-border data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:w-px data-[orientation=vertical]:self-stretch",
        className
      )}
      data-querylane-slot="separator"
      orientation={orientation}
      {...props}
    />
  );
}

export { Separator };
