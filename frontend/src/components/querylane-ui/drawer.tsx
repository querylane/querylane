import { Drawer as DrawerPrimitive } from "@base-ui/react/drawer";
import { BaseUiAgent } from "@/features/ui-agent/base-ui-adapter";
import { BaseUiSafetyBoundary } from "@/features/ui-agent/base-ui-safety";
import { baseUiModal } from "@/features/ui-agent/base-ui-safety-context";
import { cn } from "@/lib/utils";
import styles from "./drawer.module.css";

// Navigation is a full-height, horizontal swipe drawer. Keep its layout and
// reduced-motion behavior separate from the registry's snap-point drawer.
function Drawer(
  props: Omit<DrawerPrimitive.Root.Props, "swipeDirection"> & {
    swipeDirection: "left" | "right";
  }
) {
  return (
    <BaseUiSafetyBoundary markers={props} modal={baseUiModal(props, true)}>
      <DrawerPrimitive.Root {...props} />
    </BaseUiSafetyBoundary>
  );
}

function DrawerContent({
  className,
  children,
  ...props
}: DrawerPrimitive.Popup.Props) {
  return (
    <DrawerPrimitive.Portal>
      <DrawerPrimitive.Backdrop
        className={cn(
          "fixed inset-0 z-50 bg-background/80 transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0 data-swiping:transition-none motion-reduce:transition-none",
          styles["backdrop"]
        )}
        data-querylane-slot="drawer-overlay"
      />
      <DrawerPrimitive.Viewport
        className="fixed inset-0 z-50"
        data-querylane-slot="drawer-viewport"
      >
        <BaseUiAgent kind="popup">
          <DrawerPrimitive.Popup
            className={cn(
              "fixed inset-y-0 flex h-full w-3/4 translate-x-(--drawer-swipe-movement-x) flex-col bg-popover text-popover-foreground shadow-lg sm:max-w-sm",
              "transition-transform duration-200 data-swiping:transition-none motion-reduce:transition-none",
              "data-[swipe-direction=left]:left-0 data-[swipe-direction=left]:border-r data-[swipe-direction=right]:right-0 data-[swipe-direction=right]:border-l",
              "data-[swipe-direction=left]:data-ending-style:-translate-x-full data-[swipe-direction=left]:data-starting-style:-translate-x-full",
              "data-[swipe-direction=right]:data-ending-style:translate-x-full data-[swipe-direction=right]:data-starting-style:translate-x-full",
              styles["popup"],
              className
            )}
            data-querylane-slot="drawer-content"
            {...props}
          >
            {children}
          </DrawerPrimitive.Popup>
        </BaseUiAgent>
      </DrawerPrimitive.Viewport>
    </DrawerPrimitive.Portal>
  );
}

function DrawerTitle(props: DrawerPrimitive.Title.Props) {
  return <DrawerPrimitive.Title {...props} />;
}

function DrawerDescription(props: DrawerPrimitive.Description.Props) {
  return <DrawerPrimitive.Description {...props} />;
}

export { Drawer, DrawerContent, DrawerDescription, DrawerTitle };
