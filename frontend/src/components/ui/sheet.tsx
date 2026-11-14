import {
  DialogBackdrop as SheetPrimitiveBackdrop,
  DialogClose as SheetPrimitiveClose,
  DialogDescription as SheetPrimitiveDescription,
  DialogContent as SheetPrimitivePopup,
  Dialog as SheetPrimitiveRoot,
  DialogTitle as SheetPrimitiveTitle,
  DialogTrigger as SheetPrimitiveTrigger,
} from "@ui-sdk/react/dialog";
import { cn } from "cn";
import { XIcon } from "lucide-react";
import type * as React from "react";
import { Button } from "@/components/ui/button";

function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitiveRoot>) {
  return <SheetPrimitiveRoot data-querylane-slot="sheet" {...props} />;
}

function SheetTrigger({
  ...props
}: React.ComponentProps<typeof SheetPrimitiveTrigger>) {
  return (
    <SheetPrimitiveTrigger data-querylane-slot="sheet-trigger" {...props} />
  );
}

function SheetClose({
  ...props
}: React.ComponentProps<typeof SheetPrimitiveClose>) {
  return <SheetPrimitiveClose data-querylane-slot="sheet-close" {...props} />;
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitiveBackdrop>) {
  return (
    <SheetPrimitiveBackdrop
      className={cn(
        "fixed inset-0 z-50 bg-black/10 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs",
        className
      )}
      data-querylane-slot="sheet-overlay"
      {...props}
    />
  );
}

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  ...props
}: Omit<React.ComponentProps<typeof SheetPrimitivePopup>, "children"> & {
  children?: React.ReactNode;
} & {
  side?: "top" | "right" | "bottom" | "left";
  showCloseButton?: boolean;
}) {
  return (
    <>
      <SheetOverlay />
      <SheetPrimitivePopup
        className={cn(
          "fixed z-50 flex flex-col gap-4 bg-popover bg-clip-padding text-sm text-popover-foreground shadow-lg transition duration-200 ease-in-out data-ending-style:opacity-0 data-starting-style:opacity-0 data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:h-auto data-[side=bottom]:border-t data-[side=bottom]:data-ending-style:translate-y-[2.5rem] data-[side=bottom]:data-starting-style:translate-y-[2.5rem] data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-3/4 data-[side=left]:border-r data-[side=left]:data-ending-style:translate-x-[-2.5rem] data-[side=left]:data-starting-style:translate-x-[-2.5rem] data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:w-3/4 data-[side=right]:border-l data-[side=right]:data-ending-style:translate-x-[2.5rem] data-[side=right]:data-starting-style:translate-x-[2.5rem] data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:h-auto data-[side=top]:border-b data-[side=top]:data-ending-style:translate-y-[-2.5rem] data-[side=top]:data-starting-style:translate-y-[-2.5rem] data-[side=left]:sm:max-w-sm data-[side=right]:sm:max-w-sm",
          className
        )}
        data-querylane-slot="sheet-content"
        data-side={side}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitiveClose
            data-querylane-slot="sheet-close"
            render={
              <Button
                className="absolute top-4 right-4"
                size="icon-sm"
                variant="ghost"
              />
            }
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </SheetPrimitiveClose>
        )}
      </SheetPrimitivePopup>
    </>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-col gap-1.5 p-4", className)}
      data-querylane-slot="sheet-header"
      {...props}
    />
  );
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      data-querylane-slot="sheet-footer"
      {...props}
    />
  );
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitiveTitle>) {
  return (
    <SheetPrimitiveTitle
      className={cn("font-medium text-foreground", className)}
      data-querylane-slot="sheet-title"
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitiveDescription>) {
  return (
    <SheetPrimitiveDescription
      className={cn("text-sm text-muted-foreground", className)}
      data-querylane-slot="sheet-description"
      {...props}
    />
  );
}

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
};
