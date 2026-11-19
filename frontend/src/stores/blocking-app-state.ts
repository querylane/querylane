import { getBlockingRoutePath } from "@/lib/ui-error";
import type { AppUiError } from "@/lib/ui-error-types";

interface BlockingAppStateDecision {
  blockingError: AppUiError | null;
  redirectTo: "/access-denied" | "/setup" | null;
  returnTo: string | null;
  setupRequired: boolean;
}

interface BlockingAppStateFacts {
  currentHref?: string | null | undefined;
  error: AppUiError;
}

interface BlockingAppRouteFacts {
  blockingReason?: AppUiError["blockingReason"] | undefined;
  currentHref: string;
  returnTo?: string | null | undefined;
  setupStatus: "boot_error" | "booting" | "onboarding" | "ready" | "verifying";
}

function decideBlockingAppState({ currentHref, error }: BlockingAppStateFacts) {
  const redirectTo = getBlockingRoutePath(error.blockingReason);

  return {
    blockingError: error.blockingReason ? error : null,
    redirectTo,
    returnTo: redirectTo ? (currentHref ?? null) : null,
    setupRequired: error.blockingReason === "setup_required",
  } satisfies BlockingAppStateDecision;
}

interface BlockingAppNavigateOptions {
  replace: true;
  search: {
    returnTo: string;
  };
  to: "/access-denied" | "/setup";
}

function decideBlockingAppRedirect({
  blockingReason,
  currentHref,
  returnTo,
  setupStatus,
}: BlockingAppRouteFacts) {
  const blockingRoutePath = getBlockingRoutePath(blockingReason ?? null);
  const targetPath =
    blockingRoutePath ?? (setupStatus === "onboarding" ? "/setup" : null);

  if (!targetPath) {
    return null;
  }

  return {
    replace: true,
    search: {
      returnTo: returnTo ?? currentHref,
    },
    to: targetPath,
  } satisfies BlockingAppNavigateOptions | null;
}

export type { BlockingAppNavigateOptions, BlockingAppStateDecision };
export { decideBlockingAppRedirect, decideBlockingAppState };
