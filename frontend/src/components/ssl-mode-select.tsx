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
  iconClassName,
  labelClassName,
  placeholder = "Select SSL mode",
  value,
}: {
  className?: string | undefined;
  iconClassName?: string | undefined;
  labelClassName?: string | undefined;
  placeholder?: string | undefined;
  value: string | undefined;
}) {
  const option = getSslModeOption(value);
  return (
    <SelectValue className={className} placeholder={placeholder}>
      {option ? (
        <span className="flex min-w-0 items-center gap-2">
          <SslModeIcon className={iconClassName} mode={option.value} />
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
  iconClassName,
  itemClassName,
}: {
  descriptionClassName?: string | undefined;
  iconContainerClassName?: string | undefined;
  iconClassName?: string | undefined;
  itemClassName?: string | undefined;
}) {
  return SSL_MODE_OPTIONS.map((option) => (
    <SelectItem
      className={itemClassName}
      key={option.value}
      label={option.value}
      value={option.value}
    >
      <span className="flex min-w-0 items-start gap-3">
        <span
          className={cn(
            "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground",
            iconContainerClassName
          )}
        >
          <SslModeIcon className={iconClassName} mode={option.value} />
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
