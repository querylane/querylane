import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import {
  Command as BaseCommand,
  type CommandDialog as BaseCommandDialog,
  CommandEmpty as BaseCommandEmpty,
  CommandGroup as BaseCommandGroup,
  CommandInput as BaseCommandInput,
  CommandItem as BaseCommandItem,
  CommandList as BaseCommandList,
  CommandSeparator as BaseCommandSeparator,
  CommandShortcut as BaseCommandShortcut,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const commandEmptyPresentations = cva("", {
  variants: {
    presentation: {
      compact: "text-muted-foreground py-4 text-sm",
      flush: "p-0",
    },
  },
});

function CommandEmpty({
  className,
  presentation,
  ...props
}: ComponentProps<typeof BaseCommandEmpty> &
  VariantProps<typeof commandEmptyPresentations>) {
  return (
    <BaseCommandEmpty
      className={cn(commandEmptyPresentations({ presentation }), className)}
      {...props}
    />
  );
}

const commandListPresentations = cva("", {
  variants: {
    presentation: {
      search: "pt-1",
    },
  },
});

function CommandList({
  className,
  presentation,
  ...props
}: ComponentProps<typeof BaseCommandList> &
  VariantProps<typeof commandListPresentations>) {
  return (
    <BaseCommandList
      className={cn(commandListPresentations({ presentation }), className)}
      {...props}
    />
  );
}

const commandItemPresentations = cva("", {
  variants: {
    presentation: {
      secondary: "opacity-60",
    },
  },
});

function CommandItem({
  className,
  presentation,
  ...props
}: ComponentProps<typeof BaseCommandItem> &
  VariantProps<typeof commandItemPresentations>) {
  return (
    <BaseCommandItem
      className={cn(commandItemPresentations({ presentation }), className)}
      {...props}
    />
  );
}

function Command(props: ComponentProps<typeof BaseCommand>) {
  return <BaseCommand {...props} />;
}
function CommandDialog({
  title = "Command palette",
  description = "Search for a command to run…",
  children,
  className,
  showCloseButton = false,
  ...props
}: ComponentProps<typeof BaseCommandDialog>) {
  // Keep naming content inside the portal: the registry implementation renders
  // it beside the dialog, exposing a closed palette's text to screen readers.
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
function CommandGroup(props: ComponentProps<typeof BaseCommandGroup>) {
  return <BaseCommandGroup {...props} />;
}
function CommandInput(props: ComponentProps<typeof BaseCommandInput>) {
  return <BaseCommandInput {...props} />;
}
function CommandSeparator(props: ComponentProps<typeof BaseCommandSeparator>) {
  return <BaseCommandSeparator {...props} />;
}
function CommandShortcut(props: ComponentProps<typeof BaseCommandShortcut>) {
  return <BaseCommandShortcut {...props} />;
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
