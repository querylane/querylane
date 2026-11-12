import {
  PopoverDescription as PopoverPrimitiveDescription,
  PopoverContent as PopoverPrimitivePopup,
  Popover as PopoverPrimitiveRoot,
  PopoverTitle as PopoverPrimitiveTitle,
  PopoverTrigger as PopoverPrimitiveTrigger,
} from "@ui-sdk/react/popover";
import { cn } from "cn";
import type * as React from "react";

function Popover({
  ...props
}: React.ComponentProps<typeof PopoverPrimitiveRoot>) {
  return <PopoverPrimitiveRoot data-querylane-slot="popover" {...props} />;
}

function PopoverTrigger({
  ...props
}: React.ComponentProps<typeof PopoverPrimitiveTrigger>) {
  return (
    <PopoverPrimitiveTrigger data-querylane-slot="popover-trigger" {...props} />
  );
}

function PopoverContent({
  "aria-label": ariaLabel,
  children,
  className,
  align = "center",
  alignOffset = 0,
  side = "bottom",
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof PopoverPrimitivePopup>) {
  return (
    <PopoverPrimitivePopup
      align={align}
      alignOffset={alignOffset}
      className={cn(
        "z-50 flex w-72 origin-(--transform-origin) flex-col gap-4 rounded-md bg-popover p-4 text-sm whitespace-normal text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-hidden duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
        className
      )}
      data-querylane-slot="popover-content"
      side={side}
      sideOffset={sideOffset}
      {...props}
    >
      {(state) => (
        <>
          {ariaLabel === undefined ? null : (
            <PopoverPrimitiveTitle className="sr-only">
              {ariaLabel}
            </PopoverPrimitiveTitle>
          )}
          {typeof children === "function" ? children(state) : children}
        </>
      )}
    </PopoverPrimitivePopup>
  );
}

function PopoverHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-col gap-1 text-sm", className)}
      data-querylane-slot="popover-header"
      {...props}
    />
  );
}

function PopoverTitle({
  className,
  ...props
}: React.ComponentProps<typeof PopoverPrimitiveTitle>) {
  return (
    <PopoverPrimitiveTitle
      className={cn("font-medium", className)}
      data-querylane-slot="popover-title"
      {...props}
    />
  );
}

function PopoverDescription({
  className,
  ...props
}: React.ComponentProps<typeof PopoverPrimitiveDescription>) {
  return (
    <PopoverPrimitiveDescription
      className={cn("text-muted-foreground", className)}
      data-querylane-slot="popover-description"
      {...props}
    />
  );
}

export {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
};
