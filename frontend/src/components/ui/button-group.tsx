import { type PartProps, renderElement } from "@ui-sdk/react/primitive";
import type { VariantProps } from "class-variance-authority";
import { cn } from "cn";
import { Separator } from "@/components/ui/separator";
import { buttonGroupVariants } from "./button-group-variants";

function ButtonGroup({
  className,
  orientation,
  ...props
}: React.ComponentProps<"fieldset"> &
  VariantProps<typeof buttonGroupVariants>) {
  return (
    <fieldset
      className={cn(buttonGroupVariants({ orientation }), className)}
      data-orientation={orientation}
      data-querylane-slot="button-group"
      {...props}
    />
  );
}

function ButtonGroupText({ className, render, ...props }: PartProps<"div">) {
  return renderElement(
    "div",
    {
      ...props,
      className: cn(
        "flex items-center gap-2 rounded-md border bg-muted px-2.5 text-sm font-medium shadow-xs [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4",
        className
      ),
      "data-querylane-slot": "button-group-text",
    },
    render,
    {
      slot: "button-group-text",
    }
  );
}

function ButtonGroupSeparator({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<typeof Separator>) {
  return (
    <Separator
      className={cn(
        "relative self-stretch bg-input data-[orientation=horizontal]:mx-px data-[orientation=horizontal]:w-auto data-[orientation=vertical]:my-px data-[orientation=vertical]:h-auto",
        className
      )}
      data-querylane-slot="button-group-separator"
      orientation={orientation}
      {...props}
    />
  );
}

export { ButtonGroup, ButtonGroupSeparator, ButtonGroupText };
