import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { Input as BaseInput } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const inputPresentations = cva("", {
  variants: {
    presentation: {
      "search-clearable": "pr-7 pl-8 text-(length:--text-caption)",
      search: "pl-8",
      "identifier-search": "pl-8 font-mono text-xs",
      "search-body": "pl-8 text-sm",
      "onboarding-connection":
        "focus-visible:border-info-400 focus-visible:ring-info-400/25 rounded-lg border border-white/10 bg-white/3 px-4 py-0 font-mono text-sm leading-none text-white placeholder:text-white/32 focus-visible:ring-1 focus-visible:outline-none",
      identifier: "font-mono",
      compact: "text-xs",
      password: "pr-12",
      onboarding:
        "focus-visible:border-onboarding-focus focus-visible:ring-onboarding-focus/25 rounded-lg border-white/10 bg-white/3 px-3 py-0 text-sm leading-none text-white placeholder:text-white/32",
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
