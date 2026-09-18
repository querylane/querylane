import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { Label as BaseLabel } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const labelPresentations = cva("", {
  variants: {
    presentation: {
      onboarding: "font-medium text-sm text-white",
      compact: "text-xs",
      column: "gap-2 font-normal",
    },
  },
});

function Label({
  className,
  presentation,
  ...props
}: ComponentProps<typeof BaseLabel> & VariantProps<typeof labelPresentations>) {
  return (
    <BaseLabel
      className={cn(labelPresentations({ presentation }), className)}
      {...props}
    />
  );
}

export { Label };
