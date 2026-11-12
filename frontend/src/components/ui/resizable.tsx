import {
  Resizable as ResizablePrimitiveGroup,
  ResizablePanel as ResizablePrimitivePanel,
  ResizableHandle as ResizablePrimitiveSeparator,
} from "@ui-sdk/react/resizable";
import { cn } from "cn";
import type * as React from "react";

function ResizablePanelGroup({
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitiveGroup>) {
  return (
    <ResizablePrimitiveGroup
      className={cn(
        "flex size-full data-[orientation=vertical]:flex-col",
        className
      )}
      data-querylane-slot="resizable-panel-group"
      {...props}
    />
  );
}

function ResizablePanel({
  ...props
}: React.ComponentProps<typeof ResizablePrimitivePanel>) {
  return (
    <ResizablePrimitivePanel data-querylane-slot="resizable-panel" {...props} />
  );
}

function ResizableHandle({
  withHandle,
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitiveSeparator> & {
  withHandle?: boolean;
}) {
  return (
    <ResizablePrimitiveSeparator
      className={cn(
        "relative flex w-px items-center justify-center bg-border ring-offset-background after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-hidden aria-[orientation=horizontal]:h-px aria-[orientation=horizontal]:w-full aria-[orientation=horizontal]:after:left-0 aria-[orientation=horizontal]:after:h-1 aria-[orientation=horizontal]:after:w-full aria-[orientation=horizontal]:after:translate-x-0 aria-[orientation=horizontal]:after:-translate-y-1/2 [&[aria-orientation=horizontal]>div]:rotate-90",
        className
      )}
      data-querylane-slot="resizable-handle"
      {...props}
    >
      {withHandle === true && (
        <div className="z-10 flex h-6 w-1 shrink-0 rounded-lg bg-border" />
      )}
    </ResizablePrimitiveSeparator>
  );
}

export { ResizableHandle, ResizablePanel, ResizablePanelGroup };
