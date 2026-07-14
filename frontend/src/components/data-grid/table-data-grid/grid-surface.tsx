import type { ReactNode } from "react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export function GridSurface({
  busy,
  children,
  className,
  loading,
  refreshStatusLabel,
  variant = "default",
}: {
  busy: boolean;
  children: ReactNode;
  className?: string | undefined;
  loading: boolean;
  refreshStatusLabel?: string | undefined;
  variant?: "default" | "expanded" | undefined;
}) {
  return (
    <div
      aria-busy={loading}
      className={cn(
        "relative flex flex-1 flex-col",
        variant === "expanded" ? "min-h-0" : "min-h-[400px]",
        className
      )}
      data-testid="grid-refresh-surface"
    >
      {busy ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6">
          <Card
            aria-label="Refreshing data"
            className="w-[min(22rem,calc(100%-2rem))] border bg-background/95 shadow-lg backdrop-blur-sm"
            role="status"
            size="sm"
          >
            <CardHeader className="items-center text-center">
              <CardTitle className="flex items-center gap-2">
                <Spinner
                  aria-hidden="true"
                  className="size-5"
                  role="presentation"
                />
                {"Refreshing rows…"}
              </CardTitle>
              <CardDescription>
                <span className="block">
                  {"Re-evaluating the visible data set."}
                </span>
                {refreshStatusLabel ? (
                  <span className="block">{refreshStatusLabel}</span>
                ) : null}
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      ) : null}
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col transition-opacity",
          busy && "pointer-events-none opacity-50"
        )}
      >
        {children}
      </div>
    </div>
  );
}
