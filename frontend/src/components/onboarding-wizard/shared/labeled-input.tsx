import type { ComponentProps } from "react";

import { PasswordInput } from "@/components/password-input";
import { Input } from "@/components/querylane-ui/input";
import { Label } from "@/components/querylane-ui/label";
import { cn } from "@/lib/utils";

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
  const errorId = error ? `${id}-error` : undefined;
  const invalid = error ? true : undefined;

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="space-y-0.5">
        <Label htmlFor={id} presentation="onboarding">
          {label}
        </Label>
        {description ? (
          <p className="text-white/50 text-xs">{description}</p>
        ) : null}
      </div>
      {type === "password" ? (
        <PasswordInput
          aria-describedby={errorId}
          aria-invalid={invalid}
          className="h-9"
          id={id}
          presentation="onboarding"
          ref={ref}
          validation={error ? "error" : undefined}
          {...inputProps}
        />
      ) : (
        <Input
          aria-describedby={errorId}
          aria-invalid={invalid}
          className="h-9"
          id={id}
          presentation="onboarding"
          ref={ref}
          type={type}
          validation={error ? "error" : undefined}
          {...inputProps}
        />
      )}
      {error ? (
        <p className="text-negative-300/80 text-xs" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
