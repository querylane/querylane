"use client";

import { RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface ChunkLoadRecoveryPageProps {
  autoReloading?: boolean | undefined;
  className?: string | undefined;
  containerClassName?: string | undefined;
  reloadPage?: (() => void) | undefined;
}

function reloadWindow(): void {
  window.location.reload();
}

export function ChunkLoadRecoveryPage({
  autoReloading = false,
  className,
  containerClassName,
  reloadPage = reloadWindow,
}: ChunkLoadRecoveryPageProps) {
  return (
    <main
      className={cn(
        "flex min-h-screen items-center justify-center bg-background p-4",
        containerClassName
      )}
    >
      <Card className={cn("w-full max-w-xl", className)}>
        <CardHeader className="gap-3">
          <div className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
            <RefreshCcw aria-hidden="true" className="size-5" />
          </div>
          <div className="space-y-2">
            <h1 className="font-medium text-xl leading-normal">
              Querylane was updated
            </h1>
            <CardDescription aria-live="polite">
              {autoReloading
                ? "Refreshing now so the latest app files load. If the page does not refresh, use the button below."
                : "Automatic refresh paused to avoid a reload loop. Use the button below to try again."}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-lg border border-border bg-muted/30 p-3 text-muted-foreground text-sm">
            Your browser tried to open an app file from an older deployment. A
            refresh loads the newest files and keeps you on this page.
          </div>
        </CardContent>
        <CardFooter>
          <Button onClick={reloadPage} type="button">
            <RefreshCcw aria-hidden="true" className="size-4" />
            Refresh now
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}
