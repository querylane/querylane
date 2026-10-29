import type { Transport } from "@connectrpc/connect";
import { TransportProvider } from "@connectrpc/connect-query";
import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

function QueryHookProviders({
  children,
  queryClient,
  transport,
}: {
  children: ReactNode;
  queryClient: QueryClient;
  transport: Transport;
}) {
  return (
    <TransportProvider transport={transport}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </TransportProvider>
  );
}

export { QueryHookProviders };
