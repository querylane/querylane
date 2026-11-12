import {
  RadioGroup as RadioGroupPrimitive,
  Radio as RadioPrimitive,
} from "@ui-sdk/react/radio";
import { cn } from "cn";
import type { ComponentProps } from "react";

function Radio({ className, ...props }: ComponentProps<typeof RadioPrimitive>) {
  return (
    <RadioPrimitive
      className={cn(
        "group flex h-auto w-full min-w-0 items-start justify-start gap-3 overflow-hidden rounded-xl border border-white/10 bg-white/3 p-4 text-left hover:bg-white/6 focus-visible:ring-2 focus-visible:ring-ring data-checked:border-info-400/50 data-checked:bg-info-500/10",
        className
      )}
      {...props}
    />
  );
}

function RadioGroup<Value extends string = string>(
  props: ComponentProps<typeof RadioGroupPrimitive<Value>>
) {
  return <RadioGroupPrimitive<Value> className="space-y-2.5" {...props} />;
}

export { Radio, RadioGroup };
