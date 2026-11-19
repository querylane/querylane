import { TransportProvider } from "@connectrpc/connect-query";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { transport } from "@/lib/transport";

function createQueryWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { gcTime: Number.POSITIVE_INFINITY, retry: false },
      queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
    },
  });

  return { queryClient, wrapper: QueryProviders.bind(null, queryClient) };
}

function QueryProviders(
  queryClient: QueryClient,
  { children }: { children: ReactNode }
) {
  return (
    <TransportProvider transport={transport}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </TransportProvider>
  );
}

export { createQueryWrapper };
