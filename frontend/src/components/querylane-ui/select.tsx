import type { SelectRoot } from "@base-ui/react/select";
import { cva, type VariantProps } from "class-variance-authority";
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

const selectContentPresentations = cva("", {
  variants: {
    presentation: {
      onboarding:
        "rounded-card border border-white/10 bg-onboarding-surface p-2 text-white shadow-(--shadow-onboarding-control)",
    },
  },
});
function SelectContent({
  className,
  presentation,
  ...props
}: ComponentProps<typeof BaseSelectContent> &
  VariantProps<typeof selectContentPresentations>) {
  return (
    <BaseSelectContent
      className={cn(selectContentPresentations({ presentation }), className)}
      {...props}
    />
  );
}

function SelectGroup(props: ComponentProps<typeof BaseSelectGroup>) {
  return <BaseSelectGroup {...props} />;
}

function SelectItem({
  presentation,
  className,
  ...props
}: ComponentProps<typeof BaseSelectItem> & {
  presentation?: "onboarding" | undefined;
}) {
  return (
    <BaseSelectItem
      className={cn(
        "[&>div:first-child]:!min-w-0 [&>div:first-child]:!shrink [&>div:first-child]:!flex-col [&>div:first-child]:!items-start [&>div:first-child]:!gap-0.5 [&>div:first-child]:!whitespace-normal",
        presentation === "onboarding" &&
          "rounded-xl px-4 py-3 text-white focus:bg-white/7 focus:text-white",
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

const selectTriggerPresentations = cva("", {
  variants: {
    presentation: {
      identifier: "font-mono",
      onboarding:
        "rounded-lg border-white/10 bg-white/3 px-3 py-0 text-sm text-white leading-none focus-visible:border-onboarding-focus focus-visible:ring-onboarding-focus/25 [&_svg]:text-white/68",
    },
  },
});
function SelectTrigger({
  className,
  presentation,
  ...props
}: ComponentProps<typeof BaseSelectTrigger> &
  VariantProps<typeof selectTriggerPresentations>) {
  return (
    <BaseSelectTrigger
      className={cn(selectTriggerPresentations({ presentation }), className)}
      {...props}
    />
  );
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
