import type { Transport } from "@connectrpc/connect";
import { TransportProvider } from "@connectrpc/connect-query";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { createTestQueryClient } from "@/test/query-client";

interface HarnessProvidersProps {
  children: ReactNode;
  /**
   * Mounts children inside a memory router at this path, for components that
   * read router state or render `<Link>`.
   */
  routerPath?: string | undefined;
  /**
   * Serves connect-query hooks from memory. Build it with
   * `createRouterTransport` so scenarios need no network mocks.
   */
  transport?: Transport | undefined;
}

function HarnessRouter({
  children,
  path,
}: {
  children: ReactNode;
  path: string;
}) {
  const [router] = useState(() =>
    createRouter({
      history: createMemoryHistory({ initialEntries: [path] }),
      routeTree: createRootRoute({ component: () => children }),
    })
  );
  return <RouterProvider router={router} />;
}

function HarnessProviders({
  children,
  routerPath,
  transport,
}: HarnessProvidersProps) {
  const [queryClient] = useState(createTestQueryClient);
  const routed = routerPath ? (
    <HarnessRouter path={routerPath}>{children}</HarnessRouter>
  ) : (
    children
  );

  return (
    <QueryClientProvider client={queryClient}>
      {transport ? (
        <TransportProvider transport={transport}>{routed}</TransportProvider>
      ) : (
        routed
      )}
    </QueryClientProvider>
  );
}

export { HarnessProviders };
