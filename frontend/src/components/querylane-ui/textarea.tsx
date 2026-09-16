import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { Textarea as BaseTextarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const textareaPresentations = cva("", {
  variants: {
    presentation: {
      diagnostic: "bg-muted/40 font-mono text-muted-foreground text-xs",
    },
  },
});

function Textarea({
  className,
  presentation,
  ...props
}: ComponentProps<typeof BaseTextarea> &
  VariantProps<typeof textareaPresentations>) {
  return (
    <BaseTextarea
      className={cn(textareaPresentations({ presentation }), className)}
      {...props}
    />
  );
}

export { Textarea };
