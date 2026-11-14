import {
  SelectGroup as SelectPrimitiveGroup,
  SelectGroupLabel as SelectPrimitiveGroupLabel,
  SelectItem as SelectPrimitiveItem,
  SelectItemIndicator as SelectPrimitiveItemIndicator,
  SelectList as SelectPrimitiveList,
  SelectContent as SelectPrimitivePopup,
  Select as SelectPrimitiveRoot,
  SelectSeparator as SelectPrimitiveSeparator,
  SelectTrigger as SelectPrimitiveTrigger,
  SelectValue as SelectPrimitiveValue,
} from "@ui-sdk/react/select";
import { cn } from "cn";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import type * as React from "react";

function Select<Value = string, Multiple extends boolean | undefined = false>(
  props: React.ComponentProps<typeof SelectPrimitiveRoot<Value, Multiple>>
) {
  return <SelectPrimitiveRoot<Value, Multiple> {...props} />;
}

function SelectGroup({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitiveGroup>) {
  return (
    <SelectPrimitiveGroup
      className={cn("scroll-my-1 p-1", className)}
      data-querylane-slot="select-group"
      {...props}
    />
  );
}

function SelectValue({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitiveValue>) {
  return (
    <SelectPrimitiveValue
      className={cn("flex flex-1 text-left", className)}
      data-querylane-slot="select-value"
      {...props}
    />
  );
}

function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: Omit<React.ComponentProps<typeof SelectPrimitiveTrigger>, "children"> & {
  children?: React.ReactNode;
} & {
  size?: "sm" | "default";
}) {
  return (
    <SelectPrimitiveTrigger
      className={cn(
        "flex w-fit items-center justify-between gap-1.5 rounded-md border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm whitespace-nowrap shadow-xs transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-placeholder:text-muted-foreground *:data-[querylane-slot=select-value]:line-clamp-1 *:data-[querylane-slot=select-value]:flex *:data-[querylane-slot=select-value]:items-center *:data-[querylane-slot=select-value]:gap-1.5 data-[size=default]:h-9 data-[size=sm]:h-8 dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      data-querylane-slot="select-trigger"
      data-size={size}
      {...props}
    >
      {children}
      <ChevronDownIcon className="pointer-events-none size-4 text-muted-foreground" />
    </SelectPrimitiveTrigger>
  );
}

function SelectContent({
  className,
  children,
  side = "bottom",
  sideOffset = 4,
  align = "center",
  alignOffset = 0,
  alignItemWithTrigger = false,
  collisionPadding = 5,
  ...props
}: Omit<React.ComponentProps<typeof SelectPrimitivePopup>, "children"> & {
  children?: React.ReactNode;
}) {
  return (
    <SelectPrimitivePopup
      align={align}
      alignItemWithTrigger={alignItemWithTrigger}
      alignOffset={alignOffset}
      className={cn(
        "relative isolate z-50 max-h-(--available-height) w-(--anchor-width) min-w-36 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-md bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-[align-trigger=true]:animate-none data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
        className
      )}
      collisionPadding={collisionPadding}
      data-align-trigger={alignItemWithTrigger}
      data-querylane-slot="select-content"
      side={side}
      sideOffset={sideOffset}
      {...props}
    >
      <SelectPrimitiveList>{children}</SelectPrimitiveList>
    </SelectPrimitivePopup>
  );
}

function SelectLabel({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitiveGroupLabel>) {
  return (
    <SelectPrimitiveGroupLabel
      className={cn("px-2 py-1.5 text-xs text-muted-foreground", className)}
      data-querylane-slot="select-label"
      {...props}
    />
  );
}

function SelectItem({
  className,
  children,
  ...props
}: Omit<React.ComponentProps<typeof SelectPrimitiveItem>, "children"> & {
  children?: React.ReactNode;
}) {
  return (
    <SelectPrimitiveItem
      className={cn(
        "relative flex w-full cursor-pointer items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
        className
      )}
      data-querylane-slot="select-item"
      {...props}
    >
      <span
        className="flex min-w-0 flex-1 gap-2 whitespace-nowrap"
        data-querylane-slot="select-item-text"
      >
        {children}
      </span>
      <SelectPrimitiveItemIndicator
        render={
          <span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center" />
        }
      >
        <CheckIcon className="pointer-events-none" />
      </SelectPrimitiveItemIndicator>
    </SelectPrimitiveItem>
  );
}

function SelectSeparator({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitiveSeparator>) {
  return (
    <SelectPrimitiveSeparator
      className={cn("pointer-events-none -mx-1 my-1 h-px bg-border", className)}
      data-querylane-slot="select-separator"
      {...props}
    />
  );
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};
