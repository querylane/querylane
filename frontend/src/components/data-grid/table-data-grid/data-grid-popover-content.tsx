import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { BaseUiAgent } from "@/features/ui-agent/base-ui-adapter";
import { cn } from "@/lib/utils";

type DataGridPopoverContentProps = PopoverPrimitive.Popup.Props &
  Pick<
    PopoverPrimitive.Positioner.Props,
    | "align"
    | "alignOffset"
    | "collisionBoundary"
    | "collisionPadding"
    | "side"
    | "sideOffset"
  >;

function DataGridPopoverContent({
  align = "center",
  alignOffset = 0,
  className,
  collisionBoundary,
  // Preserve the existing grid-local gutter with native Base UI collision handling.
  collisionPadding = 5,
  side = "bottom",
  sideOffset = 4,
  ...props
}: DataGridPopoverContentProps) {
  const boundary =
    collisionBoundary instanceof HTMLElement
      ? {
          get x() {
            return collisionBoundary.getBoundingClientRect().left;
          },
          y: 0,
          get width() {
            return collisionBoundary.getBoundingClientRect().width;
          },
          get height() {
            return (
              collisionBoundary.ownerDocument.defaultView?.innerHeight ?? 0
            );
          },
        }
      : collisionBoundary;
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        className="isolate z-50"
        collisionBoundary={boundary}
        collisionPadding={collisionPadding}
        data-querylane-slot="grid-popover-positioner"
        positionMethod="fixed"
        side={side}
        sideOffset={sideOffset}
      >
        <BaseUiAgent kind="popup">
          <PopoverPrimitive.Popup
            className={cn(
              "z-50 flex w-72 max-w-(--available-width) origin-(--transform-origin) flex-col gap-4 rounded-md bg-popover p-4 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-hidden duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
              className
            )}
            data-querylane-slot="popover-content"
            {...props}
          />
        </BaseUiAgent>
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}

export { DataGridPopoverContent };
