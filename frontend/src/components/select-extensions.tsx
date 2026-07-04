import type { ComponentProps } from "react";

import { OverflowTooltip } from "@/components/ui/overflow-tooltip";
import { SelectValue as NativeSelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

function SelectValue({
  className,
  ...props
}: ComponentProps<typeof NativeSelectValue>) {
  return (
    <OverflowTooltip
      className={cn("flex flex-1 text-left", className)}
      data-slot="select-value"
    >
      <NativeSelectValue {...props} />
    </OverflowTooltip>
  );
}

function SelectItemDescription({
  className,
  ...props
}: ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "block text-muted-foreground text-xs leading-snug",
        className
      )}
      data-slot="select-item-description"
      {...props}
    />
  );
}

export { SelectItemDescription, SelectValue };
