import type { ErrorComponentProps } from "@tanstack/react-router";
import { DatabaseLayout } from "@/components/database-layout";
import { RouteErrorView } from "@/components/route-error-view";

export function InstanceLayoutErrorComponent({
  error,
  reset,
}: ErrorComponentProps) {
  return (
    <DatabaseLayout>
      <RouteErrorView error={error} fillViewport={true} reset={reset} />
    </DatabaseLayout>
  );
}
