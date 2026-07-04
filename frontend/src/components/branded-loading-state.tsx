import { QuerylaneLogoAnimated } from "@/components/branding/querylane-logo";
import { cn } from "@/lib/utils";

interface BrandedLoadingStateProps {
  description?: string;
  title: string;
  variant: "fullscreen" | "section";
}

const CONTAINER_CLASS_BY_VARIANT = {
  fullscreen: "min-h-screen bg-background",
  section: "min-h-[40vh]",
} as const;

const TITLE_CLASS_BY_VARIANT = {
  fullscreen: "font-bold text-2xl",
  section: "font-semibold text-xl",
} as const;

const LOGO_CLASS_BY_VARIANT = {
  fullscreen: "size-10",
  section: "size-8",
} as const;

function BrandedLoadingState({
  description,
  title,
  variant,
}: BrandedLoadingStateProps) {
  return (
    <div
      aria-live="polite"
      className={cn(
        "flex items-center justify-center p-4",
        CONTAINER_CLASS_BY_VARIANT[variant]
      )}
      data-testid="branded-loading-state"
    >
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        <QuerylaneLogoAnimated
          alt={title}
          aria-hidden="true"
          className={cn(LOGO_CLASS_BY_VARIANT[variant], "text-foreground")}
        />
        <div className="space-y-1">
          <h1 className={TITLE_CLASS_BY_VARIANT[variant]}>{title}</h1>
          {description ? (
            <p className="text-muted-foreground text-sm">{description}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export { BrandedLoadingState };
