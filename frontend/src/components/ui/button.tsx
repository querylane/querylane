import { Button as ButtonPrimitive } from "@ui-sdk/react/button";
import type { VariantProps } from "class-variance-authority";
import { cn } from "cn";
import type * as React from "react";
import { buttonVariants } from "./button-variants";

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: Omit<React.ComponentProps<typeof ButtonPrimitive>, "className"> & {
  className?: string | undefined;
} & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      className={cn(buttonVariants({ variant, size, className }))}
      data-agent-confirm={
        variant === "destructive" || props.type === "submit"
          ? "Performs a database or configuration change. Ask the person to perform this action manually."
          : undefined
      }
      data-querylane-slot="button"
      {...props}
    />
  );
}

export { Button };
