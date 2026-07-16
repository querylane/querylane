import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

function ObjectDetailHeader({
  actions,
  icon: Icon,
  iconClassName,
  stats,
  subtitle,
  title,
  titleAriaLabel,
  titlePrefix,
}: {
  actions?: ReactNode;
  icon: LucideIcon;
  iconClassName: string;
  stats?: ReactNode;
  subtitle?: ReactNode;
  title: ReactNode;
  titleAriaLabel?: string | undefined;
  titlePrefix?: string | undefined;
}) {
  return (
    <header className="flex shrink-0 flex-wrap items-end justify-between gap-x-5 gap-y-2 border-b px-4 pt-3.5 pb-2.5 sm:px-5">
      <div className="flex min-w-0 items-center gap-3">
        <div
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-lg",
            iconClassName
          )}
        >
          <Icon aria-hidden="true" className="size-4" />
        </div>
        <div className="min-w-0">
          <h1
            aria-label={titleAriaLabel}
            className="truncate font-mono font-semibold text-lg leading-tight"
            title={titleAriaLabel}
          >
            {titlePrefix ? (
              <span className="text-muted-foreground">{titlePrefix}</span>
            ) : null}
            {title}
          </h1>
          {subtitle ? (
            <p className="truncate font-mono text-[11px] text-muted-foreground">
              {subtitle}
            </p>
          ) : null}
        </div>
      </div>
      {stats || actions ? (
        <div className="flex min-w-0 flex-wrap items-center gap-3 sm:gap-5">
          {stats}
          {actions}
        </div>
      ) : null}
    </header>
  );
}

function ObjectDetailTabsBar({ children }: { children: ReactNode }) {
  // The border lives on an inner min-w-max div (so it spans the full
  // scrollable width) and the list is pulled down 1px over it: the active
  // trigger's 2px underline then paints on top of the border as one line,
  // like the mock — instead of floating 1px above it.
  return (
    <div className="shrink-0 overflow-x-auto">
      <div className="min-w-max border-b px-3 sm:px-4">
        <TabsList className="-mb-px h-9 min-w-max gap-0 p-0" variant="line">
          {children}
        </TabsList>
      </div>
    </div>
  );
}

function ObjectDetailTabTrigger({
  count,
  label,
  value,
}: {
  count?: number | undefined;
  label: string;
  value: string;
}) {
  return (
    <TabsTrigger
      className="h-full flex-none px-3 group-data-horizontal/tabs:after:bottom-0"
      value={value}
    >
      <span>{label}</span>
      {count === undefined ? null : (
        <Badge
          className="h-5 min-w-5 rounded-full px-1.5 font-mono text-[10px]"
          variant="secondary"
        >
          {count.toLocaleString()}
        </Badge>
      )}
    </TabsTrigger>
  );
}

export { ObjectDetailHeader, ObjectDetailTabsBar, ObjectDetailTabTrigger };
