import {
  CommandGroupLabel,
  Command as CommandPrimitive,
  CommandEmpty as CommandPrimitiveEmpty,
  CommandGroup as CommandPrimitiveGroup,
  CommandInput as CommandPrimitiveInput,
  CommandItem as CommandPrimitiveItem,
  CommandList as CommandPrimitiveList,
  CommandSeparator as CommandPrimitiveSeparator,
} from "@ui-sdk/react/command";
import { cn } from "cn";
import { CheckIcon, SearchIcon } from "lucide-react";
import type * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { InputGroup, InputGroupAddon } from "@/components/ui/input-group";

function Command({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      className={cn(
        "flex size-full flex-col overflow-hidden rounded-xl! bg-popover p-1 text-popover-foreground",
        className
      )}
      data-querylane-slot="command"
      {...props}
    />
  );
}

function CommandDialog({
  title = "Command Palette",
  description = "Search for a command to run...",
  children,
  className,
  showCloseButton = false,
  ...props
}: Omit<
  Omit<React.ComponentProps<typeof Dialog>, "children"> & {
    children?: React.ReactNode;
  },
  "children"
> & {
  title?: string;
  description?: string;
  className?: string;
  showCloseButton?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Dialog {...props}>
      <DialogContent
        className={cn(
          "top-1/3 translate-y-0 overflow-hidden rounded-xl! p-0",
          className
        )}
        showCloseButton={showCloseButton}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

function CommandInput({
  "aria-label": ariaLabel,
  className,
  placeholder,
  ...props
}: React.ComponentProps<typeof CommandPrimitiveInput>) {
  return (
    <div className="p-1 pb-0" data-querylane-slot="command-input-wrapper">
      <InputGroup className="h-8! rounded-lg! border-input/30 bg-input/30 shadow-none! *:data-[querylane-slot=input-group-addon]:pl-2!">
        <CommandPrimitiveInput
          aria-label={ariaLabel ?? placeholder ?? "Search commands"}
          className={cn(
            "w-full text-sm outline-hidden disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
          data-querylane-slot="command-input"
          placeholder={placeholder}
          {...props}
        />
        <InputGroupAddon>
          <SearchIcon className="size-4 shrink-0 opacity-50" />
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
}

function CommandList({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitiveList>) {
  return (
    <CommandPrimitiveList
      className={cn(
        "no-scrollbar max-h-72 scroll-py-1 overflow-x-hidden overflow-y-auto outline-none",
        className
      )}
      data-querylane-slot="command-list"
      {...props}
    />
  );
}

function CommandEmpty({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitiveEmpty>) {
  return (
    <CommandPrimitiveEmpty
      className={cn("py-6 text-center text-sm", className)}
      data-querylane-slot="command-empty"
      {...props}
    />
  );
}

function CommandGroup({
  className,
  heading,
  children,
  ...props
}: Omit<React.ComponentProps<typeof CommandPrimitiveGroup>, "children"> & {
  children?: React.ReactNode;
} & { heading?: React.ReactNode }) {
  return (
    <CommandPrimitiveGroup
      className={cn(
        "overflow-hidden p-1 text-foreground **:data-[querylane-slot=command-group-label]:px-2 **:data-[querylane-slot=command-group-label]:py-1.5 **:data-[querylane-slot=command-group-label]:text-xs **:data-[querylane-slot=command-group-label]:font-medium **:data-[querylane-slot=command-group-label]:text-muted-foreground",
        className
      )}
      data-querylane-slot="command-group"
      {...props}
    >
      {Boolean(heading) && (
        <CommandGroupLabel data-querylane-slot="command-group-label">
          {heading}
        </CommandGroupLabel>
      )}
      {children}
    </CommandPrimitiveGroup>
  );
}

function CommandSeparator({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitiveSeparator>) {
  return (
    <CommandPrimitiveSeparator
      className={cn("-mx-1 h-px w-auto bg-border", className)}
      data-querylane-slot="command-separator"
      {...props}
    />
  );
}

function CommandItem({
  className,
  children,
  ...props
}: Omit<React.ComponentProps<typeof CommandPrimitiveItem>, "children"> & {
  children?: React.ReactNode;
}) {
  return (
    <CommandPrimitiveItem
      className={cn(
        "group/command-item relative flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none in-data-[querylane-slot=dialog-content]:rounded-lg! data-highlighted:bg-muted data-highlighted:text-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 data-highlighted:**:[svg]:text-foreground",
        className
      )}
      data-querylane-slot="command-item"
      {...props}
    >
      {children}
      <CheckIcon className="ml-auto opacity-0 group-has-data-[querylane-slot=command-shortcut]/command-item:hidden group-data-[checked=true]/command-item:opacity-100" />
    </CommandPrimitiveItem>
  );
}

function CommandShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "ml-auto text-xs tracking-widest text-muted-foreground group-data-highlighted/command-item:text-foreground",
        className
      )}
      data-querylane-slot="command-shortcut"
      {...props}
    />
  );
}

export {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
};
