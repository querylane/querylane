import type { SelectRoot } from "@base-ui/react/select";
import type { ComponentProps } from "react";
import {
  Select as BaseSelect,
  SelectContent as BaseSelectContent,
  SelectGroup as BaseSelectGroup,
  SelectItem as BaseSelectItem,
  SelectLabel as BaseSelectLabel,
  SelectScrollDownButton as BaseSelectScrollDownButton,
  SelectScrollUpButton as BaseSelectScrollUpButton,
  SelectSeparator as BaseSelectSeparator,
  SelectTrigger as BaseSelectTrigger,
  SelectValue as BaseSelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

function Select<Value, Multiple extends boolean | undefined = false>(
  props: SelectRoot.Props<Value, Multiple>
) {
  return <BaseSelect {...props} />;
}

function SelectContent(props: ComponentProps<typeof BaseSelectContent>) {
  return <BaseSelectContent {...props} />;
}

function SelectGroup(props: ComponentProps<typeof BaseSelectGroup>) {
  return <BaseSelectGroup {...props} />;
}

function SelectItem({
  className,
  ...props
}: ComponentProps<typeof BaseSelectItem>) {
  return (
    <BaseSelectItem
      className={cn(
        "[&>div:first-child]:!min-w-0 [&>div:first-child]:!shrink [&>div:first-child]:!flex-col [&>div:first-child]:!items-start [&>div:first-child]:!gap-0.5 [&>div:first-child]:!whitespace-normal",
        className
      )}
      {...props}
    />
  );
}

function SelectLabel(props: ComponentProps<typeof BaseSelectLabel>) {
  return <BaseSelectLabel {...props} />;
}

function SelectScrollDownButton(
  props: ComponentProps<typeof BaseSelectScrollDownButton>
) {
  return <BaseSelectScrollDownButton {...props} />;
}

function SelectScrollUpButton(
  props: ComponentProps<typeof BaseSelectScrollUpButton>
) {
  return <BaseSelectScrollUpButton {...props} />;
}

function SelectSeparator(props: ComponentProps<typeof BaseSelectSeparator>) {
  return <BaseSelectSeparator {...props} />;
}

function SelectTrigger(props: ComponentProps<typeof BaseSelectTrigger>) {
  return <BaseSelectTrigger {...props} />;
}

function SelectValue(props: ComponentProps<typeof BaseSelectValue>) {
  return <BaseSelectValue {...props} />;
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};
