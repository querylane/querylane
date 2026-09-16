import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import {
  Command as BaseCommand,
  CommandDialog as BaseCommandDialog,
  CommandEmpty as BaseCommandEmpty,
  CommandGroup as BaseCommandGroup,
  CommandInput as BaseCommandInput,
  CommandItem as BaseCommandItem,
  CommandList as BaseCommandList,
  CommandSeparator as BaseCommandSeparator,
  CommandShortcut as BaseCommandShortcut,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

const commandEmptyPresentations = cva("", {
  variants: {
    presentation: {
      compact: "py-4 text-muted-foreground text-sm",
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
function CommandDialog(props: ComponentProps<typeof BaseCommandDialog>) {
  return <BaseCommandDialog {...props} />;
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
