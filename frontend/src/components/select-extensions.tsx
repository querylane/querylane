import type { ComponentProps } from "react";

import { OverflowTooltip } from "@/components/querylane-ui/overflow-tooltip";
import { SelectValue as NativeSelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

function SelectValue({
  presentation,
  className,
  ...props
}: ComponentProps<typeof NativeSelectValue> & {
  presentation?: "onboarding-value" | undefined;
}) {
  return (
    <OverflowTooltip
      className={cn("flex flex-1 text-left", className)}
      data-querylane-slot="select-value"
      presentation={presentation}
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
        "block text-xs leading-snug text-muted-foreground",
        className
      )}
      data-querylane-slot="select-item-description"
      {...props}
    />
  );
}

export { SelectItemDescription, SelectValue };
