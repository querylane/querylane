"use client";

import { RefreshCcw } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
} from "@/components/querylane-ui/card";
import { Button } from "@/components/ui/button";
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
        "bg-background flex min-h-dvh items-center justify-center p-4",
        containerClassName
      )}
    >
      <Card className={cn("w-full max-w-xl", className)}>
        <CardHeader presentation="spacious">
          <div className="bg-primary/10 text-primary flex size-11 items-center justify-center rounded-full">
            <RefreshCcw aria-hidden="true" className="size-5" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl leading-normal font-medium">
              Querylane was updated
            </h1>
            <CardDescription aria-live="polite">
              {autoReloading
                ? "Refreshing now so the latest app files load. If the page does not refresh, use the button below."
                : "Automatic refresh paused to avoid a reload loop. Use the button below to try again."}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent presentation="stacked">
          <div className="border-border bg-muted/30 text-muted-foreground rounded-lg border p-3 text-sm">
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
