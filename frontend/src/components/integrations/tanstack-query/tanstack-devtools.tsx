import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import type { AnyRouter } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

interface TanStackDevtoolsProps {
  router: AnyRouter;
}

export function TanStackDevtools({ router }: TanStackDevtoolsProps) {
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
