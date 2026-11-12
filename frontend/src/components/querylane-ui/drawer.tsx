import {
  DrawerBackdrop as DrawerPrimitiveBackdrop,
  DrawerDescription as DrawerPrimitiveDescription,
  DrawerContent as DrawerPrimitivePopup,
  Drawer as DrawerPrimitiveRoot,
  DrawerTitle as DrawerPrimitiveTitle,
} from "@ui-sdk/react/drawer";
import type * as React from "react";
import { cn } from "@/lib/utils";

// Navigation is a full-height, horizontal swipe drawer. Keep its layout and
// reduced-motion behavior separate from the generic bottom-sheet layout.
function Drawer(props: React.ComponentProps<typeof DrawerPrimitiveRoot>) {
  return <DrawerPrimitiveRoot {...props} />;
}

function DrawerContent({
  className,
  children,
  ...props
}: Omit<React.ComponentProps<typeof DrawerPrimitivePopup>, "children"> & {
  children?: React.ReactNode;
}) {
  return (
    <>
      <DrawerPrimitiveBackdrop
        className={cn(
          "fixed inset-0 z-50 bg-background/80 transition-opacity duration-200 data-dragging:transition-none data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none"
        )}
        data-querylane-slot="drawer-overlay"
      />
      <DrawerPrimitivePopup
        className={cn(
          "flex h-full w-3/4 flex-col bg-popover text-popover-foreground shadow-lg sm:max-w-sm",
          "transition-transform duration-200 data-dragging:transition-none motion-reduce:transition-none",
          className
        )}
        data-querylane-slot="drawer-content"
        {...props}
      >
        {children}
      </DrawerPrimitivePopup>
    </>
  );
}

function DrawerTitle(props: React.ComponentProps<typeof DrawerPrimitiveTitle>) {
  return <DrawerPrimitiveTitle {...props} />;
}

function DrawerDescription(
  props: React.ComponentProps<typeof DrawerPrimitiveDescription>
) {
  return <DrawerPrimitiveDescription {...props} />;
}

export { Drawer, DrawerContent, DrawerDescription, DrawerTitle };
