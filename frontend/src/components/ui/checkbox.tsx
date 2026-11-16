import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { cn } from "cn";
import { CheckIcon } from "lucide-react";
import type * as React from "react";
import { BaseUiAgent } from "@/features/ui-agent/base-ui-adapter";

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <BaseUiAgent kind="checkbox">
      <CheckboxPrimitive.Root
        className={cn(
          "peer relative flex size-4 shrink-0 items-center justify-center rounded-control-sm border border-input shadow-xs transition-shadow outline-none group-has-disabled/field:opacity-50 group-has-[:focus-visible]/field-label:ring-0 group-has-[:focus-visible]/field-label:not-data-checked:border-input after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 aria-invalid:aria-checked:border-primary dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground group-has-[:focus-visible]/field-label:data-checked:border-primary dark:data-checked:bg-primary",
          className
        )}
        data-querylane-agent-readonly={props.readOnly === true || undefined}
        data-querylane-slot="checkbox"
        {...props}
      >
        <CheckboxPrimitive.Indicator
          className="grid place-content-center text-current transition-none [&>svg]:size-3.5"
          data-querylane-slot="checkbox-indicator"
        >
          <CheckIcon />
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
    </BaseUiAgent>
  );
}

export { Checkbox };
