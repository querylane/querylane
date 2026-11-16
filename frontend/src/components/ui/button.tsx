import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { type ChangeDetails, dispatch } from "@ui-sdk/core";
import type { VariantProps } from "class-variance-authority";
import { cn } from "cn";
import type * as React from "react";
import { BaseUiAgent } from "@/features/ui-agent/base-ui-adapter";
import { buttonVariants } from "./button-variants";

function Button({
  className,
  variant = "default",
  size = "default",
  onClick,
  ...props
}: Omit<
  React.ComponentProps<typeof ButtonPrimitive>,
  "className" | "onClick"
> & {
  className?: string | undefined;
  onClick?:
    | ((
        event: React.MouseEvent<HTMLButtonElement>,
        details: ChangeDetails<"press">
      ) => void | Promise<void>)
    | undefined;
} & VariantProps<typeof buttonVariants>) {
  return (
    <BaseUiAgent kind="button">
      <ButtonPrimitive
        className={cn(buttonVariants({ variant, size, className }))}
        data-agent-confirm={
          variant === "destructive" || props.type === "submit"
            ? "Performs a database or configuration change. Ask the person to perform this action manually."
            : undefined
        }
        data-querylane-slot="button"
        onClick={
          onClick
            ? (event) => {
                if (
                  dispatch({ options: () => ({ onClick }) }, "onClick", event, {
                    reason: "press",
                    event: event.nativeEvent,
                  })
                ) {
                  event.preventDefault();
                }
              }
            : undefined
        }
        {...props}
      />
    </BaseUiAgent>
  );
}

export { Button };
