import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import {
  Popover as BasePopover,
  PopoverContent as BasePopoverContent,
  PopoverDescription as BasePopoverDescription,
  PopoverHeader as BasePopoverHeader,
  PopoverTitle as BasePopoverTitle,
  PopoverTrigger as BasePopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const popoverTriggerPresentations = cva("", {
  variants: {
    presentation: {
      "sidebar-switcher":
        "gap-2 rounded-md border border-sidebar-border bg-sidebar-accent px-2.5 shadow-sm outline-none transition-colors hover:border-ring focus-visible:ring-2 focus-visible:ring-sidebar-ring data-[popup-open]:border-ring",
      breadcrumb:
        "gap-1.5 rounded-md px-2 py-1.5 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    },
    breadcrumbWidth: {
      instance: "max-w-[11rem] sm:max-w-[14rem]",
      database: "max-w-[12rem] sm:max-w-[14rem]",
    },
  },
});

function PopoverTrigger({
  breadcrumbWidth,
  className,
  presentation,
  ...props
}: ComponentProps<typeof BasePopoverTrigger> &
  VariantProps<typeof popoverTriggerPresentations>) {
  return (
    <BasePopoverTrigger
      className={cn(
        popoverTriggerPresentations({ presentation, breadcrumbWidth }),
        className
      )}
      {...props}
    />
  );
}

const popoverContentPresentations = cva("", {
  variants: {
    presentation: {
      flush: "p-0",
      detail: "gap-0 p-0",
      ownership: "gap-2.5",
      compact: "gap-3 p-3",
    },
    width: { instance: "w-72", database: "w-64" },
  },
});

function PopoverContent({
  width,
  className,
  presentation,
  ...props
}: ComponentProps<typeof BasePopoverContent> &
  VariantProps<typeof popoverContentPresentations>) {
  return (
    <BasePopoverContent
      className={cn(
        popoverContentPresentations({ presentation, width }),
        className
      )}
      {...props}
    />
  );
}

const popoverHeaderPresentations = cva("", {
  variants: {
    presentation: {
      detail: "border-b p-4",
    },
  },
});

function PopoverHeader({
  className,
  presentation,
  ...props
}: ComponentProps<typeof BasePopoverHeader> &
  VariantProps<typeof popoverHeaderPresentations>) {
  return (
    <BasePopoverHeader
      className={cn(popoverHeaderPresentations({ presentation }), className)}
      {...props}
    />
  );
}

const popoverTitlePresentations = cva("", {
  variants: {
    presentation: {
      identifier: "font-mono text-sm",
    },
  },
});

function PopoverTitle({
  className,
  presentation,
  ...props
}: ComponentProps<typeof BasePopoverTitle> &
  VariantProps<typeof popoverTitlePresentations>) {
  return (
    <BasePopoverTitle
      className={cn(popoverTitlePresentations({ presentation }), className)}
      {...props}
    />
  );
}

function Popover(props: ComponentProps<typeof BasePopover>) {
  return <BasePopover {...props} />;
}
function PopoverDescription(
  props: ComponentProps<typeof BasePopoverDescription>
) {
  return <BasePopoverDescription {...props} />;
}

export {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
};
