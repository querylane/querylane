import type { Transport } from "@connectrpc/connect";
import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext } from "@tanstack/react-router";
import {
  RootComponent,
  RootErrorComponent,
  RootNotFoundComponent,
} from "@/routes/root-shell";

interface AppRouterContext {
  queryClient: QueryClient;
  transport: Transport;
}

export const Route = createRootRouteWithContext<AppRouterContext>()({
  component: RootComponent,
  errorComponent: RootErrorComponent,
  notFoundComponent: RootNotFoundComponent,
});
