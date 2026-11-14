import {
  MenuCheckboxItem as MenuPrimitiveCheckboxItem,
  MenuItemIndicator as MenuPrimitiveCheckboxItemIndicator,
  MenuGroup as MenuPrimitiveGroup,
  MenuGroupLabel as MenuPrimitiveGroupLabel,
  MenuItem as MenuPrimitiveItem,
  MenuContent as MenuPrimitivePopup,
  MenuRadioGroup as MenuPrimitiveRadioGroup,
  MenuRadioItem as MenuPrimitiveRadioItem,
  MenuItemIndicator as MenuPrimitiveRadioItemIndicator,
  Menu as MenuPrimitiveRoot,
  MenuSeparator as MenuPrimitiveSeparator,
  MenuSubContent as MenuPrimitiveSubmenuPopup,
  MenuSub as MenuPrimitiveSubmenuRoot,
  MenuSubTrigger as MenuPrimitiveSubmenuTrigger,
  MenuTrigger as MenuPrimitiveTrigger,
} from "@ui-sdk/react/menu";
import { cn } from "cn";
import { CheckIcon, ChevronRightIcon } from "lucide-react";
import type * as React from "react";

function DropdownMenu({
  ...props
}: React.ComponentProps<typeof MenuPrimitiveRoot>) {
  return <MenuPrimitiveRoot data-querylane-slot="dropdown-menu" {...props} />;
}

function DropdownMenuTrigger({
  ...props
}: React.ComponentProps<typeof MenuPrimitiveTrigger>) {
  return (
    <MenuPrimitiveTrigger
      data-querylane-slot="dropdown-menu-trigger"
      {...props}
    />
  );
}

function DropdownMenuContent({
  align = "start",
  alignOffset = 0,
  anchor,
  side = "bottom",
  sideOffset = 4,
  className,
  ...props
}: React.ComponentProps<typeof MenuPrimitivePopup>) {
  return (
    <MenuPrimitivePopup
      align={align}
      alignOffset={alignOffset}
      {...(anchor === undefined ? {} : { anchor })}
      className={cn(
        "z-50 max-h-(--available-height) w-(--anchor-width) min-w-32 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-md bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 outline-none data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:overflow-hidden data-closed:fade-out-0 data-closed:zoom-out-95",
        className
      )}
      data-querylane-slot="dropdown-menu-content"
      side={side}
      sideOffset={sideOffset}
      {...props}
    />
  );
}

function DropdownMenuGroup({
  ...props
}: React.ComponentProps<typeof MenuPrimitiveGroup>) {
  return (
    <MenuPrimitiveGroup data-querylane-slot="dropdown-menu-group" {...props} />
  );
}

function DropdownMenuLabel({
  className,
  inset,
  ...props
}: React.ComponentProps<typeof MenuPrimitiveGroupLabel> & {
  inset?: boolean;
}) {
  return (
    <MenuPrimitiveGroupLabel
      className={cn(
        "px-2 py-1.5 text-xs font-medium text-muted-foreground data-inset:pl-8",
        className
      )}
      data-inset={inset}
      data-querylane-slot="dropdown-menu-label"
      {...props}
    />
  );
}

function DropdownMenuItem({
  className,
  inset,
  variant = "default",
  ...props
}: React.ComponentProps<typeof MenuPrimitiveItem> & {
  inset?: boolean;
  variant?: "default" | "destructive";
}) {
  return (
    <MenuPrimitiveItem
      className={cn(
        "group/dropdown-menu-item relative flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-inset:pl-8 data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 data-[variant=destructive]:focus:text-destructive dark:data-[variant=destructive]:focus:bg-destructive/20 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 data-[variant=destructive]:*:[svg]:text-destructive",
        className
      )}
      data-agent-confirm={
        variant === "destructive"
          ? "Destructive action. Ask the person to perform this action manually."
          : undefined
      }
      data-inset={inset}
      data-querylane-slot="dropdown-menu-item"
      data-variant={variant}
      {...props}
    />
  );
}

function DropdownMenuSub({
  ...props
}: React.ComponentProps<typeof MenuPrimitiveSubmenuRoot>) {
  return (
    <MenuPrimitiveSubmenuRoot
      data-querylane-slot="dropdown-menu-sub"
      {...props}
    />
  );
}

function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: Omit<
  React.ComponentProps<typeof MenuPrimitiveSubmenuTrigger>,
  "children"
> & { children?: React.ReactNode } & {
  inset?: boolean;
}) {
  return (
    <MenuPrimitiveSubmenuTrigger
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-inset:pl-8 data-popup-open:bg-accent data-popup-open:text-accent-foreground data-open:bg-accent data-open:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      data-inset={inset}
      data-querylane-slot="dropdown-menu-sub-trigger"
      {...props}
    >
      {children}
      <ChevronRightIcon className="ml-auto" />
    </MenuPrimitiveSubmenuTrigger>
  );
}

function DropdownMenuSubContent({
  align = "start",
  alignOffset = -3,
  side = "right",
  sideOffset = 0,
  className,
  ...props
}: React.ComponentProps<typeof MenuPrimitiveSubmenuPopup>) {
  return (
    <MenuPrimitiveSubmenuPopup
      align={align}
      alignOffset={alignOffset}
      className={cn(
        "w-auto min-w-[96px] rounded-md bg-popover p-1 text-popover-foreground shadow-lg ring-1 ring-foreground/10 duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
        className
      )}
      data-querylane-slot="dropdown-menu-sub-content"
      side={side}
      sideOffset={sideOffset}
      {...props}
    />
  );
}

function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  inset,
  ...props
}: Omit<React.ComponentProps<typeof MenuPrimitiveCheckboxItem>, "children"> & {
  children?: React.ReactNode;
} & {
  inset?: boolean;
}) {
  return (
    <MenuPrimitiveCheckboxItem
      className={cn(
        "relative flex cursor-pointer items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground data-inset:pl-8 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      data-inset={inset}
      data-querylane-slot="dropdown-menu-checkbox-item"
      {...(checked === undefined ? {} : { checked })}
      {...props}
    >
      <span
        className="pointer-events-none absolute right-2 flex items-center justify-center"
        data-querylane-slot="dropdown-menu-checkbox-item-indicator"
      >
        <MenuPrimitiveCheckboxItemIndicator>
          <CheckIcon />
        </MenuPrimitiveCheckboxItemIndicator>
      </span>
      {children}
    </MenuPrimitiveCheckboxItem>
  );
}

function DropdownMenuRadioGroup({
  ...props
}: React.ComponentProps<typeof MenuPrimitiveRadioGroup>) {
  return (
    <MenuPrimitiveRadioGroup
      data-querylane-slot="dropdown-menu-radio-group"
      {...props}
    />
  );
}

function DropdownMenuRadioItem({
  className,
  children,
  inset,
  ...props
}: Omit<React.ComponentProps<typeof MenuPrimitiveRadioItem>, "children"> & {
  children?: React.ReactNode;
} & {
  inset?: boolean;
}) {
  return (
    <MenuPrimitiveRadioItem
      className={cn(
        "relative flex cursor-pointer items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground data-inset:pl-8 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      data-inset={inset}
      data-querylane-slot="dropdown-menu-radio-item"
      {...props}
    >
      <span
        className="pointer-events-none absolute right-2 flex items-center justify-center"
        data-querylane-slot="dropdown-menu-radio-item-indicator"
      >
        <MenuPrimitiveRadioItemIndicator>
          <CheckIcon />
        </MenuPrimitiveRadioItemIndicator>
      </span>
      {children}
    </MenuPrimitiveRadioItem>
  );
}

function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof MenuPrimitiveSeparator>) {
  return (
    <MenuPrimitiveSeparator
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      data-querylane-slot="dropdown-menu-separator"
      {...props}
    />
  );
}

function DropdownMenuShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "ml-auto text-xs tracking-widest text-muted-foreground group-focus/dropdown-menu-item:text-accent-foreground",
        className
      )}
      data-querylane-slot="dropdown-menu-shortcut"
      {...props}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
};
