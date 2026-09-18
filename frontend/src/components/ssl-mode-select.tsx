import type { LucideIcon } from "lucide-react";
import {
  BadgeCheck,
  GlobeLock,
  LockKeyhole,
  Shield,
  ShieldOff,
  ShieldQuestion,
} from "lucide-react";
import { SelectItem } from "@/components/querylane-ui/select";
import {
  SelectItemDescription,
  SelectValue,
} from "@/components/select-extensions";
import {
  getSslModeOption,
  SSL_MODE_OPTIONS,
  type SslModeOptionValue,
} from "@/lib/ssl-modes";
import { cn } from "@/lib/utils";

const SSL_MODE_ICONS = {
  allow: ShieldQuestion,
  disable: ShieldOff,
  prefer: Shield,
  require: LockKeyhole,
  "verify-ca": BadgeCheck,
  "verify-full": GlobeLock,
} satisfies Record<SslModeOptionValue, LucideIcon>;

function SslModeIcon({
  className,
  mode,
}: {
  className?: string | undefined;
  mode: SslModeOptionValue;
}) {
  const Icon = SSL_MODE_ICONS[mode];
  return (
    <Icon
      aria-hidden="true"
      className={cn("size-4 text-muted-foreground", className)}
      data-mode={mode}
      data-slot="ssl-mode-icon"
    />
  );
}

function SslModeSelectValue({
  className,
  iconTone,
  labelClassName,
  presentation,
  placeholder = "Select SSL mode",
  value,
}: {
  className?: string | undefined;
  iconTone?: "onboarding";
  labelClassName?: string | undefined;
  presentation?: "onboarding-value";
  placeholder?: string | undefined;
  value: string | undefined;
}) {
  const option = getSslModeOption(value);
  return (
    <SelectValue
      className={className}
      placeholder={placeholder}
      presentation={presentation}
    >
      {option ? (
        <span className="flex min-w-0 items-center gap-2">
          <SslModeIcon
            className={iconTone === "onboarding" ? "text-white/68" : undefined}
            mode={option.value}
          />
          <span className={cn("truncate", labelClassName)}>{option.value}</span>
        </span>
      ) : (
        placeholder
      )}
    </SelectValue>
  );
}

function SslModeSelectItems({
  descriptionClassName,
  iconContainerClassName,
  iconTone,
  presentation,
}: {
  descriptionClassName?: string | undefined;
  iconContainerClassName?: string | undefined;
  iconTone?: "onboarding";
  presentation?: "onboarding";
}) {
  return SSL_MODE_OPTIONS.map((option) => (
    <SelectItem
      key={option.value}
      label={option.value}
      presentation={presentation}
      value={option.value}
    >
      <span className="flex min-w-0 items-start gap-3">
        <span
          className={cn(
            "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground",
            iconContainerClassName
          )}
        >
          <SslModeIcon
            className={iconTone === "onboarding" ? "text-white/68" : undefined}
            mode={option.value}
          />
        </span>
        <span className="min-w-0">
          <span className="block font-medium">{option.value}</span>
          <SelectItemDescription className={descriptionClassName}>
            {option.description}
          </SelectItemDescription>
        </span>
      </span>
    </SelectItem>
  ));
}

export { SslModeSelectItems, SslModeSelectValue };
