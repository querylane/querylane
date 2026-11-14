import {
  AlertDialogBackdrop as AlertDialogPrimitiveBackdrop,
  AlertDialogClose as AlertDialogPrimitiveClose,
  AlertDialogDescription as AlertDialogPrimitiveDescription,
  AlertDialogContent as AlertDialogPrimitivePopup,
  AlertDialog as AlertDialogPrimitiveRoot,
  AlertDialogTitle as AlertDialogPrimitiveTitle,
  AlertDialogTrigger as AlertDialogPrimitiveTrigger,
} from "@ui-sdk/react/alert-dialog";
import { cn } from "cn";
import type * as React from "react";

import { Button } from "@/components/ui/button";

function AlertDialog({
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitiveRoot>) {
  return (
    <AlertDialogPrimitiveRoot data-querylane-slot="alert-dialog" {...props} />
  );
}

function AlertDialogTrigger({
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitiveTrigger>) {
  return (
    <AlertDialogPrimitiveTrigger
      data-querylane-slot="alert-dialog-trigger"
      {...props}
    />
  );
}

function AlertDialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitiveBackdrop>) {
  return (
    <AlertDialogPrimitiveBackdrop
      className={cn(
        "fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      data-querylane-slot="alert-dialog-overlay"
      {...props}
    />
  );
}

function AlertDialogContent({
  className,
  size = "default",
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitivePopup> & {
  size?: "default" | "sm";
}) {
  return (
    <>
      <AlertDialogOverlay />
      <AlertDialogPrimitivePopup
        className={cn(
          "group/alert-dialog-content fixed top-1/2 left-1/2 z-50 grid w-full -translate-1/2 gap-6 rounded-xl bg-popover p-6 text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none data-[size=default]:max-w-xs data-[size=sm]:max-w-xs data-[size=default]:sm:max-w-lg data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className
        )}
        data-querylane-slot="alert-dialog-content"
        data-size={size}
        {...props}
      />
    </>
  );
}

function AlertDialogHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "grid grid-rows-[auto_1fr] place-items-center gap-1.5 text-center has-data-[querylane-slot=alert-dialog-media]:grid-rows-[auto_auto_1fr] has-data-[querylane-slot=alert-dialog-media]:gap-x-6 sm:group-data-[size=default]/alert-dialog-content:place-items-start sm:group-data-[size=default]/alert-dialog-content:text-left sm:group-data-[size=default]/alert-dialog-content:has-data-[querylane-slot=alert-dialog-media]:grid-rows-[auto_1fr]",
        className
      )}
      data-querylane-slot="alert-dialog-header"
      {...props}
    />
  );
}

function AlertDialogFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-col-reverse gap-2 group-data-[size=sm]/alert-dialog-content:grid group-data-[size=sm]/alert-dialog-content:grid-cols-2 sm:flex-row sm:justify-end",
        className
      )}
      data-querylane-slot="alert-dialog-footer"
      {...props}
    />
  );
}

function AlertDialogMedia({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "mb-2 inline-flex size-16 items-center justify-center rounded-md bg-muted sm:group-data-[size=default]/alert-dialog-content:row-span-2 *:[svg:not([class*='size-'])]:size-8",
        className
      )}
      data-querylane-slot="alert-dialog-media"
      {...props}
    />
  );
}

function AlertDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitiveTitle>) {
  return (
    <AlertDialogPrimitiveTitle
      className={cn(
        "text-lg font-medium sm:group-data-[size=default]/alert-dialog-content:group-has-data-[querylane-slot=alert-dialog-media]/alert-dialog-content:col-start-2",
        className
      )}
      data-querylane-slot="alert-dialog-title"
      {...props}
    />
  );
}

function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitiveDescription>) {
  return (
    <AlertDialogPrimitiveDescription
      className={cn(
        "text-sm text-balance text-muted-foreground md:text-pretty *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      data-querylane-slot="alert-dialog-description"
      {...props}
    />
  );
}

function AlertDialogAction({
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button
      className={cn(className)}
      data-querylane-slot="alert-dialog-action"
      {...props}
    />
  );
}

function AlertDialogCancel({
  className,
  variant = "outline",
  size = "default",
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitiveClose> &
  Pick<React.ComponentProps<typeof Button>, "variant" | "size">) {
  return (
    <AlertDialogPrimitiveClose
      className={cn(className)}
      data-querylane-slot="alert-dialog-cancel"
      render={<Button size={size} variant={variant} />}
      {...props}
    />
  );
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogOverlay,
  AlertDialogTitle,
  AlertDialogTrigger,
};
