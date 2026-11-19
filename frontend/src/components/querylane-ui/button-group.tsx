import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import {
  ButtonGroup as BaseButtonGroup,
  ButtonGroupSeparator as BaseButtonGroupSeparator,
} from "@/components/ui/button-group";
import { cn } from "@/lib/utils";

const buttonGroupSeparatorPresentations = cva("", {
  variants: {
    presentation: {
      "on-primary": "bg-primary/70",
    },
  },
});

function ButtonGroupSeparator({
  className,
  presentation,
  ...props
}: ComponentProps<typeof BaseButtonGroupSeparator> &
  VariantProps<typeof buttonGroupSeparatorPresentations>) {
  return (
    <BaseButtonGroupSeparator
      className={cn(
        buttonGroupSeparatorPresentations({ presentation }),
        className
      )}
      {...props}
    />
  );
}

function ButtonGroup(props: ComponentProps<typeof BaseButtonGroup>) {
  return <BaseButtonGroup {...props} />;
}

export { ButtonGroup, ButtonGroupSeparator };
