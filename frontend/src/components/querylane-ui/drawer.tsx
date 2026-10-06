import { Drawer as DrawerPrimitive } from "@base-ui/react/drawer";
import { cn } from "@/lib/utils";
import styles from "./drawer.module.css";

function Drawer(
  props: Omit<DrawerPrimitive.Root.Props, "swipeDirection"> & {
    swipeDirection: "left" | "right";
  }
) {
  return <DrawerPrimitive.Root {...props} />;
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
          styles["backdrop"],
          styles["swipeTransition"]
        )}
        data-slot="drawer-overlay"
      />
      <DrawerPrimitive.Viewport
        className="fixed inset-0 z-50"
        data-slot="drawer-viewport"
      >
        <DrawerPrimitive.Popup
          className={cn(
            "fixed inset-y-0 flex h-full w-3/4 translate-x-(--drawer-swipe-movement-x) flex-col bg-popover text-popover-foreground shadow-lg transition-transform duration-200",
            "data-[swipe-direction=right]:right-0 data-[swipe-direction=left]:left-0 data-[swipe-direction=left]:border-r data-[swipe-direction=right]:border-l",
            "data-[swipe-direction=left]:data-ending-style:-translate-x-full data-[swipe-direction=left]:data-starting-style:-translate-x-full",
            "data-[swipe-direction=right]:data-ending-style:translate-x-full data-[swipe-direction=right]:data-starting-style:translate-x-full",
            "data-swiping:transition-none",
            styles["swipeTransition"],
            "motion-reduce:transition-none sm:max-w-sm",
            className
          )}
          data-slot="drawer-content"
          {...props}
        >
          {children}
        </DrawerPrimitive.Popup>
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
