import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type SetupFlowExplainerLayout = "compact" | "full";
type SetupFlowExplainerTone = "onboarding" | "surface";
type SetupFlowExplainerVariant = "configure" | "managed" | "setup";

interface SetupFlowExplainerProps {
  className?: string;
  layout?: SetupFlowExplainerLayout;
  tone: SetupFlowExplainerTone;
  variant: SetupFlowExplainerVariant;
}

const STEP_COPY: Record<
  SetupFlowExplainerVariant,
  {
    firstDescription: string;
    firstKicker: string;
    secondDescription: string;
    secondKicker: string;
  }
> = {
  configure: {
    firstDescription: "This form configures QueryLane’s own metadata database.",
    firstKicker: "Step 1",
    secondDescription:
      "QueryLane asks for that separate server after internal storage is ready.",
    secondKicker: "Next",
  },
  managed: {
    firstDescription:
      "QueryLane’s own metadata database was configured during setup.",
    firstKicker: "Step 1 complete",
    secondDescription:
      "Add the database server whose databases and schemas you want to administer.",
    secondKicker: "Step 2",
  },
  setup: {
    firstDescription:
      "Where QueryLane stores its own metadata, saved connection records, and query history.",
    firstKicker: "Step 1",
    secondDescription:
      "After setup, register the application, production, or analytics server you want QueryLane to administer.",
    secondKicker: "Step 2",
  },
};

function getToneClasses(tone: SetupFlowExplainerTone) {
  if (tone === "surface") {
    return {
      activeCard: "border-border/70 bg-muted/20",
      activeKicker: "text-muted-foreground",
      body: "text-muted-foreground",
      grid: "rounded-lg border border-border/70 bg-muted/20 p-4",
      inactiveCard: "border-border/70 bg-background/40",
      inactiveKicker: "text-muted-foreground",
      title: "font-medium text-sm",
    };
  }

  return {
    activeCard: "border-blue-400/25 bg-blue-500/[0.08]",
    activeKicker: "text-blue-300",
    body: "text-white/58",
    grid: "rounded-2xl",
    inactiveCard: "border-white/10 bg-white/[0.03]",
    inactiveKicker: "text-white/44",
    title: "font-semibold text-base text-white",
  };
}

export function SetupFlowExplainer({
  className,
  layout = "full",
  tone,
  variant,
}: SetupFlowExplainerProps) {
  const copy = STEP_COPY[variant];
  const classes = getToneClasses(tone);

  if (layout === "compact") {
    const compactTitle =
      tone === "surface"
        ? "font-medium text-xs"
        : "font-medium text-white/90 text-xs";
    return (
      <div className={cn("flex flex-wrap items-center gap-2", className)}>
        <fieldset
          aria-label="QueryLane internal storage step"
          className={cn(
            "flex min-w-0 items-center gap-2 rounded-full border px-3 py-1.5",
            classes.activeCard
          )}
        >
          <span
            className={cn(
              "text-[10px] uppercase tracking-[0.14em]",
              classes.activeKicker
            )}
          >
            {copy.firstKicker}
          </span>
          <span className={compactTitle}>QueryLane internal storage</span>
          <span className="sr-only">{copy.firstDescription}</span>
        </fieldset>
        <ChevronRight className={cn("size-3.5 shrink-0", classes.body)} />
        <fieldset
          aria-label="Postgres server to manage step"
          className={cn(
            "flex min-w-0 items-center gap-2 rounded-full border px-3 py-1.5",
            classes.inactiveCard
          )}
        >
          <span
            className={cn(
              "text-[10px] uppercase tracking-[0.14em]",
              classes.inactiveKicker
            )}
          >
            {copy.secondKicker}
          </span>
          <span className={compactTitle}>Postgres server to manage</span>
          <span className="sr-only">{copy.secondDescription}</span>
        </fieldset>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]",
        classes.grid,
        className
      )}
    >
      <fieldset
        aria-label="QueryLane internal storage step"
        className={cn("rounded-2xl border p-4", classes.activeCard)}
      >
        <div
          className={cn(
            "text-xs uppercase tracking-[0.18em]",
            classes.activeKicker
          )}
        >
          {copy.firstKicker}
        </div>
        <div className={cn("mt-2", classes.title)}>
          QueryLane internal storage
        </div>
        <p className={cn("mt-1 text-sm leading-6", classes.body)}>
          {copy.firstDescription}
        </p>
      </fieldset>
      <div className={cn("hidden items-center md:flex", classes.body)}>
        <ChevronRight className="size-5" />
      </div>
      <fieldset
        aria-label="Postgres server to manage step"
        className={cn("rounded-2xl border p-4", classes.inactiveCard)}
      >
        <div
          className={cn(
            "text-xs uppercase tracking-[0.18em]",
            classes.inactiveKicker
          )}
        >
          {copy.secondKicker}
        </div>
        <div className={cn("mt-2", classes.title)}>
          Postgres server to manage
        </div>
        <p className={cn("mt-1 text-sm leading-6", classes.body)}>
          {copy.secondDescription}
        </p>
      </fieldset>
    </div>
  );
}
