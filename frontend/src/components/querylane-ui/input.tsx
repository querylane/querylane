import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { Input as BaseInput } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const inputPresentations = cva("", {
  variants: {
    presentation: {
      "search-clearable": "text-(length:--text-caption) pr-7 pl-8",
      search: "pl-8",
      "identifier-search": "pl-8 font-mono text-xs",
      "search-body": "pl-8 text-sm",
      "onboarding-connection":
        "rounded-lg border border-white/10 bg-white/3 px-4 py-0 font-mono text-sm text-white leading-none placeholder:text-white/32 focus-visible:border-info-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-info-400/25",
      identifier: "font-mono",
      password: "pr-12",
      onboarding:
        "rounded-lg border-white/10 bg-white/3 px-3 py-0 text-sm text-white leading-none placeholder:text-white/32 focus-visible:border-onboarding-focus focus-visible:ring-onboarding-focus/25",
    },
    trailingAction: { true: "pr-12" },
    validation: {
      error:
        "border-negative-400/40 focus-visible:border-negative-400/60 focus-visible:ring-negative-400/20",
    },
  },
});

function Input({
  trailingAction,
  className,
  presentation,
  validation,
  ...props
}: ComponentProps<typeof BaseInput> & VariantProps<typeof inputPresentations>) {
  return (
    <BaseInput
      className={cn(
        inputPresentations({ presentation, trailingAction, validation }),
        className
      )}
      {...props}
    />
  );
}

export { Input };
