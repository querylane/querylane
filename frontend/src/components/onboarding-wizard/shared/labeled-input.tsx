import type { ComponentProps } from "react";

import { PasswordInput } from "@/components/password-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface LabeledInputProps
  extends Omit<ComponentProps<"input">, "className" | "children"> {
  className?: string | undefined;
  description?: string | undefined;
  error?: string | undefined;
  inputClassName?: string | undefined;
  label: string;
}

const BASE_INPUT_CLASSES =
  "h-11 rounded-xl border-white/10 bg-white/[0.03] px-4 py-0 text-base text-white leading-none placeholder:text-white/32 focus-visible:border-[#4b73d7] focus-visible:ring-[#4b73d7]/25";

const ERROR_INPUT_CLASSES =
  "border-red-400/40 focus-visible:border-red-400/60 focus-visible:ring-red-400/20";

export function LabeledInput({
  className,
  description,
  error,
  id,
  inputClassName,
  label,
  type = "text",
  ref,
  ...inputProps
}: LabeledInputProps) {
  const inputCn = cn(
    BASE_INPUT_CLASSES,
    error && ERROR_INPUT_CLASSES,
    inputClassName
  );
  const errorId = error ? `${id}-error` : undefined;
  const invalid = error ? true : undefined;

  return (
    <div className={cn("space-y-2.5", className)}>
      <div className="space-y-1">
        <Label className="font-medium text-base text-white" htmlFor={id}>
          {label}
        </Label>
        {description ? (
          <p className="text-sm text-white/50">{description}</p>
        ) : null}
      </div>
      {type === "password" ? (
        <PasswordInput
          aria-describedby={errorId}
          aria-invalid={invalid}
          className={inputCn}
          id={id}
          ref={ref}
          {...inputProps}
        />
      ) : (
        <Input
          aria-describedby={errorId}
          aria-invalid={invalid}
          className={inputCn}
          id={id}
          ref={ref}
          type={type}
          {...inputProps}
        />
      )}
      {error ? (
        <p className="text-red-300/80 text-sm" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
