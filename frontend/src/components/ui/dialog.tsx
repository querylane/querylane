import {
  DialogBackdrop as DialogPrimitiveBackdrop,
  DialogClose as DialogPrimitiveClose,
  DialogDescription as DialogPrimitiveDescription,
  DialogContent as DialogPrimitivePopup,
  Dialog as DialogPrimitiveRoot,
  DialogTitle as DialogPrimitiveTitle,
  DialogTrigger as DialogPrimitiveTrigger,
} from "@ui-sdk/react/dialog";
import { cn } from "cn";
import { XIcon } from "lucide-react";
import type * as React from "react";
import { Button } from "@/components/ui/button";

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitiveRoot>) {
  return <DialogPrimitiveRoot data-querylane-slot="dialog" {...props} />;
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitiveTrigger>) {
  return (
    <DialogPrimitiveTrigger data-querylane-slot="dialog-trigger" {...props} />
  );
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitiveClose>) {
  return <DialogPrimitiveClose data-querylane-slot="dialog-close" {...props} />;
}

function DialogOverlay({
  className,
  motion = "default",
  ...props
}: React.ComponentProps<typeof DialogPrimitiveBackdrop> & {
  motion?: "default" | "none";
}) {
  return (
    <DialogPrimitiveBackdrop
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
}: Omit<React.ComponentProps<typeof DialogPrimitivePopup>, "children"> & {
  children?: React.ReactNode;
} & {
  showCloseButton?: boolean;
  motion?: "default" | "none";
}) {
  return (
    <>
      <DialogOverlay motion={motion} />
      <DialogPrimitivePopup
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
          <DialogPrimitiveClose
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
          </DialogPrimitiveClose>
        )}
      </DialogPrimitivePopup>
    </>
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
        <DialogPrimitiveClose render={<Button variant="outline" />}>
          Close
        </DialogPrimitiveClose>
      )}
    </div>
  );
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitiveTitle>) {
  return (
    <DialogPrimitiveTitle
      className={cn("leading-none font-medium", className)}
      data-querylane-slot="dialog-title"
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitiveDescription>) {
  return (
    <DialogPrimitiveDescription
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
