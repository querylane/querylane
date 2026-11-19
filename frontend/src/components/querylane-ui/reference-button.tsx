import type { ComponentProps } from "react";
import { Button } from "@/components/querylane-ui/button";
import { cn } from "@/lib/utils";

function ReferenceButton({
  className,
  ...props
}: ComponentProps<typeof Button>) {
  return (
    <Button
      className={cn(
        "text-reference underline decoration-dotted underline-offset-4 hover:text-reference-hover hover:underline",
        className
      )}
      variant="link"
      {...props}
    />
  );
}

export { ReferenceButton };
