import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import {
  Alert as BaseAlert,
  AlertAction as BaseAlertAction,
  AlertDescription as BaseAlertDescription,
  AlertTitle as BaseAlertTitle,
} from "@/components/ui/alert";
import { cn } from "@/lib/utils";

const alertDescriptionPresentations = cva("", {
  variants: {
    presentation: {
      stacked: "space-y-3",
      "onboarding-warning": "text-warning-100/70",
      "onboarding-notice": "text-warning-100/75",
      compact: "text-xs leading-relaxed",
    },
  },
});

function AlertDescription({
  className,
  presentation,
  ...props
}: ComponentProps<typeof BaseAlertDescription> &
  VariantProps<typeof alertDescriptionPresentations>) {
  return (
    <BaseAlertDescription
      className={cn(alertDescriptionPresentations({ presentation }), className)}
      {...props}
    />
  );
}

const alertPresentations = cva("", {
  variants: {
    presentation: {
      "onboarding-warning": "border-warning-400/20 bg-warning-500/6",
      "onboarding-notice": "border-warning-400/25 bg-warning-500/8",
      "responsive-action":
        "has-data-[slot=alert-action]:pr-4 sm:has-data-[slot=alert-action]:pr-44",
      compact: "px-3 py-2",
      insights: "has-data-[slot=alert-action]:pr-4",
      "insights-error":
        "border-destructive/30 bg-destructive/5 has-data-[slot=alert-action]:pr-4",
    },
  },
});

function Alert({
  className,
  presentation,
  ...props
}: ComponentProps<typeof BaseAlert> & VariantProps<typeof alertPresentations>) {
  return (
    <BaseAlert
      className={cn(alertPresentations({ presentation }), className)}
      {...props}
    />
  );
}

const alertTitlePresentations = cva("", {
  variants: {
    presentation: {
      "onboarding-warning": "text-warning-100",
    },
  },
});

function AlertTitle({
  className,
  presentation,
  ...props
}: ComponentProps<typeof BaseAlertTitle> &
  VariantProps<typeof alertTitlePresentations>) {
  return (
    <BaseAlertTitle
      className={cn(alertTitlePresentations({ presentation }), className)}
      {...props}
    />
  );
}

function AlertAction(props: ComponentProps<typeof BaseAlertAction>) {
  return <BaseAlertAction {...props} />;
}

export { Alert, AlertAction, AlertDescription, AlertTitle };
