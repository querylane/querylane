import { type PartProps, renderElement } from "@ui-sdk/react/primitive";
import type { VariantProps } from "class-variance-authority";
import { cn } from "cn";
import { badgeVariants } from "./badge-variants";

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: PartProps<"span"> & VariantProps<typeof badgeVariants>) {
  return renderElement(
    "span",
    {
      ...props,
      className: cn(badgeVariants({ variant }), className),
      "data-querylane-slot": "badge",
      "data-variant": variant,
    },
    render,
    {
      slot: "badge",
      variant,
    }
  );
}

export { Badge };
