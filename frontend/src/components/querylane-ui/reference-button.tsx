import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Querylane-specific look for buttons that jump to another catalog resource
// (e.g. foreign key values in the data grid): a dotted underline in the shared
// --reference token. Lives outside components/ui so the vendored shadcn
// button stays in sync with the registry.
function ReferenceButton({
  className,
  ...props
}: ComponentProps<typeof Button>) {
  return (
    <Button
      className={cn(
        "text-reference underline decoration-dotted underline-offset-4 hover:underline hover:[color:color-mix(in_oklch,var(--reference)_82%,var(--foreground))]",
        className
      )}
      variant="link"
      {...props}
    />
  );
}

export { ReferenceButton };
