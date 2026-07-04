"use client";

import { Navigate, useLocation } from "@tanstack/react-router";

import { decideBlockingAppRedirect } from "@/stores/blocking-app-state";
import { useBlockingErrorStore } from "@/stores/blocking-error-store";
import { useSetupStore } from "@/stores/setup-store";

function buildCurrentHref(location: {
  hash: string;
  pathname: string;
  searchStr: string;
}) {
  return `${location.pathname}${location.searchStr}${location.hash}`;
}

export function AppErrorRedirectController() {
  const location = useLocation();
  const blockingError = useBlockingErrorStore((state) => state.blockingError);
  const returnTo = useBlockingErrorStore((state) => state.returnTo);
  const status = useSetupStore((state) => state.status);
  const redirectOptions = decideBlockingAppRedirect({
    blockingReason: blockingError?.blockingReason ?? null,
    currentHref: buildCurrentHref(location),
    returnTo,
    setupStatus: status,
  });

  if (!redirectOptions || location.pathname === redirectOptions.to) {
    return null;
  }

  return <Navigate {...redirectOptions} />;
}
