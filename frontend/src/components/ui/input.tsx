import { Input as InputPrimitive } from "@base-ui/react/input";
import type { ChangeDetails } from "@ui-sdk/core";
import { useFieldControl } from "@ui-sdk/react/field";
import { cn } from "cn";
import type * as React from "react";
import { useRef } from "react";
import { BaseUiAgent } from "@/features/ui-agent/base-ui-adapter";
import { dispatchBaseUiChange } from "@/lib/base-ui-change";

function Input({
  className,
  type,
  onValueChange,
  ...props
}: Omit<React.ComponentProps<typeof InputPrimitive>, "onValueChange"> & {
  onValueChange?:
    | ((value: string, details: ChangeDetails<"input-change">) => void)
    | undefined;
}) {
  const field = useFieldControl();
  const acceptedValueRef = useRef(props.value ?? props.defaultValue ?? "");
  const inputProps = { ...props, type, name: props.name ?? field?.name };
  return (
    <BaseUiAgent kind="input">
      <InputPrimitive
        className={cn(
          "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-2.5 py-1 text-base shadow-xs transition-colors outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
          className
        )}
        data-querylane-slot="input"
        onValueChange={(value, details) => {
          dispatchBaseUiChange(onValueChange, value, {
            ...details,
            reason: "input-change",
          });
          if (
            details.isCanceled &&
            details.event.target instanceof HTMLInputElement
          ) {
            // Base UI cancels validation, not an uncontrolled native DOM edit.
            // Preserve this facade's established draft-veto contract.
            details.event.target.value = String(
              props.value ?? acceptedValueRef.current
            );
          } else {
            acceptedValueRef.current = value;
          }
        }}
        {...(field ? field.props(inputProps) : inputProps)}
        disabled={props.disabled === true || field?.disabled === true}
      />
    </BaseUiAgent>
  );
}

export { Input };
