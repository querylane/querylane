import * as React from "react";

import { cn } from "@/lib/utils";

function InlineCode({
  className,
  ...props
}: React.ComponentProps<"code">) {
  return (
    <code
      className={cn(
        "rounded bg-muted px-1.5 py-0.5 font-mono text-sm",
        className
      )}
      {...props}
    />
  );
}

export { InlineCode };
