import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import {
  DropdownMenu as BaseDropdownMenu,
  DropdownMenuCheckboxItem as BaseDropdownMenuCheckboxItem,
  DropdownMenuContent as BaseDropdownMenuContent,
  DropdownMenuGroup as BaseDropdownMenuGroup,
  DropdownMenuItem as BaseDropdownMenuItem,
  DropdownMenuLabel as BaseDropdownMenuLabel,
  DropdownMenuPortal as BaseDropdownMenuPortal,
  DropdownMenuRadioGroup as BaseDropdownMenuRadioGroup,
  DropdownMenuRadioItem as BaseDropdownMenuRadioItem,
  DropdownMenuSeparator as BaseDropdownMenuSeparator,
  DropdownMenuShortcut as BaseDropdownMenuShortcut,
  DropdownMenuSub as BaseDropdownMenuSub,
  DropdownMenuSubContent as BaseDropdownMenuSubContent,
  DropdownMenuSubTrigger as BaseDropdownMenuSubTrigger,
  DropdownMenuTrigger as BaseDropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const dropdownMenuLabelPresentations = cva("", {
  variants: {
    presentation: {
      stacked: "gap-0.5",
    },
  },
});

function DropdownMenuLabel({
  className,
  presentation,
  ...props
}: ComponentProps<typeof BaseDropdownMenuLabel> &
  VariantProps<typeof dropdownMenuLabelPresentations>) {
  return (
    <BaseDropdownMenuLabel
      className={cn(
        dropdownMenuLabelPresentations({ presentation }),
        className
      )}
      {...props}
    />
  );
}

const dropdownMenuItemPresentations = cva("", {
  variants: {
    presentation: {
      compact: "gap-2 text-xs",
    },
  },
});

function DropdownMenuItem({
  className,
  presentation,
  ...props
}: ComponentProps<typeof BaseDropdownMenuItem> &
  VariantProps<typeof dropdownMenuItemPresentations>) {
  return (
    <BaseDropdownMenuItem
      className={cn(dropdownMenuItemPresentations({ presentation }), className)}
      {...props}
    />
  );
}

function DropdownMenu(props: ComponentProps<typeof BaseDropdownMenu>) {
  return <BaseDropdownMenu {...props} />;
}
function DropdownMenuCheckboxItem(
  props: ComponentProps<typeof BaseDropdownMenuCheckboxItem>
) {
  return <BaseDropdownMenuCheckboxItem {...props} />;
}
function DropdownMenuContent(
  props: ComponentProps<typeof BaseDropdownMenuContent>
) {
  return <BaseDropdownMenuContent {...props} />;
}
function DropdownMenuGroup(
  props: ComponentProps<typeof BaseDropdownMenuGroup>
) {
  return <BaseDropdownMenuGroup {...props} />;
}
function DropdownMenuPortal(
  props: ComponentProps<typeof BaseDropdownMenuPortal>
) {
  return <BaseDropdownMenuPortal {...props} />;
}
function DropdownMenuRadioGroup(
  props: ComponentProps<typeof BaseDropdownMenuRadioGroup>
) {
  return <BaseDropdownMenuRadioGroup {...props} />;
}
function DropdownMenuRadioItem(
  props: ComponentProps<typeof BaseDropdownMenuRadioItem>
) {
  return <BaseDropdownMenuRadioItem {...props} />;
}
function DropdownMenuSeparator(
  props: ComponentProps<typeof BaseDropdownMenuSeparator>
) {
  return <BaseDropdownMenuSeparator {...props} />;
}
function DropdownMenuShortcut(
  props: ComponentProps<typeof BaseDropdownMenuShortcut>
) {
  return <BaseDropdownMenuShortcut {...props} />;
}
function DropdownMenuSub(props: ComponentProps<typeof BaseDropdownMenuSub>) {
  return <BaseDropdownMenuSub {...props} />;
}
function DropdownMenuSubContent(
  props: ComponentProps<typeof BaseDropdownMenuSubContent>
) {
  return <BaseDropdownMenuSubContent {...props} />;
}
function DropdownMenuSubTrigger(
  props: ComponentProps<typeof BaseDropdownMenuSubTrigger>
) {
  return <BaseDropdownMenuSubTrigger {...props} />;
}
function DropdownMenuTrigger(
  props: ComponentProps<typeof BaseDropdownMenuTrigger>
) {
  return <BaseDropdownMenuTrigger {...props} />;
}

export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
};
