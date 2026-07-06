import { TransportProvider } from "@connectrpc/connect-query";
import { QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";

import { RouteErrorView } from "@/components/route-error-view";
import { logger } from "@/lib/diagnostics";
import { queryClient } from "@/lib/query-client";
import { createReactRootErrorHandlers } from "@/lib/react-root-errors";
import {
  getDefaultPreload,
  getDefaultPreloadStaleTime,
} from "@/lib/router-options";
import { transport } from "@/lib/transport";
import { normalizeAppUiError, reportAppUiError } from "@/lib/ui-error";

import { routeTree } from "./routeTree.gen";
import "./index.css";

const TanStackDevtools = import.meta.env.DEV
  ? lazy(() =>
      import("@/components/integrations/tanstack-query/tanstack-devtools").then(
        (module) => ({ default: module.TanStackDevtools })
      )
    )
  : null;

const router = createRouter({
  context: { queryClient, transport },
  defaultErrorComponent: RouteErrorView,
  defaultOnCatch: (error) => {
    reportAppUiError(
      normalizeAppUiError(error, {
        area: "router",
        source: "router",
      })
    );
  },
  defaultPreload: getDefaultPreload(),
  defaultPreloadStaleTime: getDefaultPreloadStaleTime(),
  routeTree,
});

router.subscribe("onResolved", (event) => {
  if (!(event.hrefChanged || event.pathChanged)) {
    return;
  }

  const activeMatch = router.state.matches.at(-1);
  const routeId = activeMatch?.routeId ?? "unknown-route";
  const routePath = activeMatch?.fullPath ?? event.toLocation.pathname;

  logger.debug(logger.fmt`Navigation resolved for ${routePath}`, {
    routeId,
  });
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Missing #root element in index.html");
}

createRoot(rootElement, createReactRootErrorHandlers()).render(
  <StrictMode>
    <TransportProvider transport={transport}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        {TanStackDevtools ? (
          <Suspense fallback={null}>
            <TanStackDevtools router={router} />
          </Suspense>
        ) : null}
      </QueryClientProvider>
    </TransportProvider>
  </StrictMode>
);
