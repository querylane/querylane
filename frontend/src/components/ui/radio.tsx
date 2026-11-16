import { Radio as BaseRadio } from "@base-ui/react/radio";
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group";
import { cn } from "cn";
import type { ComponentProps } from "react";
import { BaseUiAgent } from "@/features/ui-agent/base-ui-adapter";

function Radio({ className, ...props }: ComponentProps<typeof BaseRadio.Root>) {
  return (
    <BaseUiAgent kind="radio">
      <BaseRadio.Root
        className={cn(
          "group flex h-auto w-full min-w-0 items-start justify-start gap-3 overflow-hidden rounded-xl border border-white/10 bg-white/3 p-4 text-left hover:bg-white/6 focus-visible:ring-2 focus-visible:ring-ring data-checked:border-info-400/50 data-checked:bg-info-500/10",
          className
        )}
        {...props}
      />
    </BaseUiAgent>
  );
}

function RadioGroup<Value extends string = string>(
  props: ComponentProps<typeof RadioGroupPrimitive<Value | null>>
) {
  return (
    <RadioGroupPrimitive<Value | null> className="space-y-2.5" {...props} />
  );
}

export { Radio, RadioGroup };
