import { type ComponentProps, useId } from "react";
import { PasswordInput } from "@/components/password-input";
import { Input } from "@/components/querylane-ui/input";
import { Label } from "@/components/querylane-ui/label";
import { cn } from "@/lib/utils";
import { isNonEmptyString } from "@/lib/value-guards";

interface LabeledInputProps
  extends Omit<ComponentProps<"input">, "className" | "children"> {
  className?: string | undefined;
  description?: string | undefined;
  error?: string | undefined;
  label: string;
}

export function LabeledInput({
  className,
  description,
  error,
  id,
  label,
  type = "text",
  ref,
  ...inputProps
}: LabeledInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = isNonEmptyString(error) ? `${inputId}-error` : undefined;
  const invalid = isNonEmptyString(error) ? true : undefined;

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="space-y-0.5">
        <Label htmlFor={inputId} presentation="onboarding">
          {label}
        </Label>
        {isNonEmptyString(description) ? (
          <p className="text-xs text-white/50">{description}</p>
        ) : null}
      </div>
      {type === "password" ? (
        <PasswordInput
          aria-describedby={errorId}
          aria-invalid={invalid}
          className="h-9"
          id={inputId}
          presentation="onboarding"
          ref={ref}
          validation={isNonEmptyString(error) ? "error" : undefined}
          {...inputProps}
        />
      ) : (
        <Input
          aria-describedby={errorId}
          aria-invalid={invalid}
          className="h-9"
          id={inputId}
          presentation="onboarding"
          ref={ref}
          type={type}
          validation={isNonEmptyString(error) ? "error" : undefined}
          {...inputProps}
        />
      )}
      {isNonEmptyString(error) ? (
        <p className="text-negative-300/80 text-xs" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
