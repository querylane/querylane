import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { Spinner as BaseSpinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

const spinnerPresentations = cva("", {
  variants: {
    presentation: {
      muted: "text-muted-foreground",
    },
  },
});

function Spinner({
  className,
  presentation,
  ...props
}: ComponentProps<typeof BaseSpinner> &
  VariantProps<typeof spinnerPresentations>) {
  return (
    <BaseSpinner
      className={cn(spinnerPresentations({ presentation }), className)}
      {...props}
    />
  );
}

export { Spinner };
