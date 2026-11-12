import {
  PopoverContent as PopoverPrimitivePopup,
  PopoverTitle as PopoverPrimitiveTitle,
} from "@ui-sdk/react/popover";
import type * as React from "react";
import { cn } from "@/lib/utils";
import { bindGridPopoverBounds } from "./grid-popover-bounds";
import styles from "./grid-popover-bounds.module.css";

type DataGridPopoverContentProps = Omit<
  React.ComponentProps<typeof PopoverPrimitivePopup>,
  "ref"
> & { collisionBoundary?: HTMLElement | undefined };

function DataGridPopoverContent({
  "aria-label": ariaLabel,
  children,
  align = "center",
  alignOffset = 0,
  className,
  collisionBoundary,
  collisionPadding = 8,
  side = "bottom",
  sideOffset = 4,
  ...props
}: DataGridPopoverContentProps) {
  // UI SDK constrains to the viewport; the data grid also needs its own bounds.
  return (
    <PopoverPrimitivePopup
      align={align}
      alignOffset={alignOffset}
      className={cn(
        "z-50 flex w-72 origin-(--transform-origin) flex-col gap-4 rounded-md bg-popover p-4 text-sm whitespace-normal text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-hidden duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
        collisionBoundary && styles["bounded"],
        className
      )}
      collisionPadding={collisionPadding}
      data-querylane-slot="popover-content"
      ref={(element) =>
        collisionBoundary && element
          ? bindGridPopoverBounds(element, collisionBoundary)
          : undefined
      }
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

export { DataGridPopoverContent };
