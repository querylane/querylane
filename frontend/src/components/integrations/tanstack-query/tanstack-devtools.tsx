import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import type { AnyRouter } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Remembers, per browser tab, that devtools were opened so they survive dev
 * reloads. Session-scoped on purpose: a fresh tab starts without the panels.
 */
const MOUNT_STORAGE_KEY = "querylane-devtools-mounted";

function readPersistedMount() {
  try {
    return window.sessionStorage.getItem(MOUNT_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function persistMount() {
  try {
    window.sessionStorage.setItem(MOUNT_STORAGE_KEY, "1");
  } catch {
    // Storage being unavailable only loses reload persistence.
  }
}

interface TanStackDevtoolsProps {
  router: AnyRouter;
}

/**
 * Dev-only TanStack devtools, mounted on demand instead of at startup. The
 * closed query + router panels alone add ~1000 DOM nodes (~2/3 of a typical
 * page), which the browser re-runs style recalc over on every resize media
 * query flip — the main source of dev-mode resize jank. Until the launcher is
 * clicked, none of that DOM exists.
 */
export function TanStackDevtools({ router }: TanStackDevtoolsProps) {
  const [isMounted, setIsMounted] = useState(readPersistedMount);

  if (!isMounted) {
    return (
      <Button
        className="fixed right-4 bottom-4 z-50 opacity-60 hover:opacity-100"
        onClick={() => {
          persistMount();
          setIsMounted(true);
        }}
        size="sm"
        variant="outline"
      >
        TanStack devtools
      </Button>
    );
  }

  return (
    <>
      <ReactQueryDevtools buttonPosition="bottom-right" initialIsOpen={false} />
      <TanStackRouterDevtools
        initialIsOpen={false}
        position="bottom-right"
        router={router}
      />
    </>
  );
}
