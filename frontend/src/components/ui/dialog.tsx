import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { cn } from "cn";
import { XIcon } from "lucide-react";
import type * as React from "react";
import { Button } from "@/components/ui/button";
import { BaseUiAgent } from "@/features/ui-agent/base-ui-adapter";
import { BaseUiSafetyBoundary } from "@/features/ui-agent/base-ui-safety";
import {
  type BaseUiSafetyProps,
  baseUiModal,
} from "@/features/ui-agent/base-ui-safety-context";

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root> & BaseUiSafetyProps) {
  return (
    <BaseUiSafetyBoundary markers={props} modal={baseUiModal(props, true)}>
      <DialogPrimitive.Root data-querylane-slot="dialog" {...props} />
    </BaseUiSafetyBoundary>
  );
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return (
    <BaseUiAgent kind="popup">
      <DialogPrimitive.Trigger
        data-querylane-slot="dialog-trigger"
        {...props}
      />
    </BaseUiAgent>
  );
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return (
    <DialogPrimitive.Close data-querylane-slot="dialog-close" {...props} />
  );
}

function DialogOverlay({
  className,
  motion = "default",
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Backdrop> & {
  motion?: "default" | "none";
}) {
  return (
    <DialogPrimitive.Backdrop
      className={cn(
        "fixed inset-0 isolate z-50 bg-black/10 supports-backdrop-filter:backdrop-blur-xs",
        motion === "default" &&
          "duration-100 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      data-querylane-slot="dialog-overlay"
      {...props}
    />
  );
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  motion = "default",
  ...props
}: Omit<React.ComponentProps<typeof DialogPrimitive.Popup>, "children"> & {
  children?: React.ReactNode;
} & {
  showCloseButton?: boolean;
  motion?: "default" | "none";
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogOverlay motion={motion} />
      <BaseUiAgent kind="popup">
        <DialogPrimitive.Popup
          className={cn(
            "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-1/2 gap-6 rounded-xl bg-popover p-6 text-sm text-popover-foreground ring-1 ring-foreground/10 outline-none sm:max-w-md",
            motion === "default" &&
              "duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className
          )}
          data-querylane-slot="dialog-content"
          {...props}
        >
          {children}
          {showCloseButton && (
            <DialogPrimitive.Close
              data-querylane-slot="dialog-close"
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
            </DialogPrimitive.Close>
          )}
        </DialogPrimitive.Popup>
      </BaseUiAgent>
    </DialogPrimitive.Portal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-col gap-2", className)}
      data-querylane-slot="dialog-header"
      {...props}
    />
  );
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className
      )}
      data-querylane-slot="dialog-footer"
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="outline" />}>
          Close
        </DialogPrimitive.Close>
      )}
    </div>
  );
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn("leading-none font-medium", className)}
      data-querylane-slot="dialog-title"
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      data-querylane-slot="dialog-description"
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogTitle,
  DialogTrigger,
};
