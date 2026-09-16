import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { Skeleton as BaseSkeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const skeletonPresentations = cva("", {
  variants: {
    presentation: {
      control: "rounded-md",
      round: "rounded-full",
    },
  },
});

function Skeleton({
  className,
  presentation,
  ...props
}: ComponentProps<typeof BaseSkeleton> &
  VariantProps<typeof skeletonPresentations>) {
  return (
    <BaseSkeleton
      className={cn(skeletonPresentations({ presentation }), className)}
      {...props}
    />
  );
}

export { Skeleton };
